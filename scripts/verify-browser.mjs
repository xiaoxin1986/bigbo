/**
 * 真实浏览器验收脚本（复用本机 Chrome / Edge，不下载额外浏览器）。
 * 用法：先启动 `npm run dev`（或 `npm run preview`），再执行
 *   npm run verify:browser
 * 可用 BIGBO_URL 覆盖地址，默认 http://localhost:5173
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.BIGBO_URL || 'http://localhost:5173'
const STORAGE_KEY = 'bigbo.posts.v1'
const OUT_DIR = path.resolve(process.cwd(), 'verify-output')

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const results = []
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    results.push(`  ✅ ${name}`)
  } else {
    failed += 1
    results.push(`  ❌ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

const text = (page, selector) => page.locator(selector).first().innerText()
const contents = (page) => page.$$eval('.post-card__content', (nodes) => nodes.map((n) => n.textContent))

async function main() {
  const executablePath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!executablePath) throw new Error('未找到本机 Chrome / Edge，无法执行浏览器验收')
  mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  // ---------- 1. 空状态 ----------
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.site-header')

  check('页面标题正确', (await page.title()) === 'BigBo · 记录此刻，分享所想')
  check('品牌名渲染', (await text(page, '.brand__name')) === 'BigBo')
  check('展示本地存储徽标', (await text(page, '.storage-badge')).includes('本地存储'))
  check('首次进入为空状态', await page.locator('[data-test="empty-state"]').isVisible())
  check('计数为 0 条', (await text(page, '[data-test="feed-count"]')) === '0 条')
  check('初始字数 0 / 280', (await text(page, '.counter')) === '0\n/ 280' || (await text(page, '.counter')).replace(/\s+/g, ' ') === '0 / 280')
  check('空内容时发布按钮禁用', await page.locator('[data-test="publish"]').isDisabled())

  await page.screenshot({ path: path.join(OUT_DIR, '01-empty.png'), fullPage: true })

  // ---------- 2. 白名单空白内容不可发布 ----------
  await page.fill('#postInput', '     ')
  check('纯空白内容仍禁用发布', await page.locator('[data-test="publish"]').isDisabled())
  check('空白内容计数为 5', (await text(page, '.counter__value')) === '5')

  // ---------- 3. 发布第一条 ----------
  await page.fill('#postInput', '  今天把 BigBo 跑起来了  ')
  check('有内容时按钮可用', await page.locator('[data-test="publish"]').isEnabled())
  await page.screenshot({ path: path.join(OUT_DIR, '02-composing.png'), fullPage: true })

  await page.locator('#postInput').press('Control+Enter')
  await page.waitForSelector('.post-card')

  check('Ctrl+Enter 发布成功', (await contents(page))[0] === '今天把 BigBo 跑起来了')
  check('发布后输入框清空', (await page.inputValue('#postInput')) === '')
  check('发布后计数为 1 条', (await text(page, '[data-test="feed-count"]')) === '1 条')
  check('空状态已隐藏', (await page.locator('[data-test="empty-state"]').count()) === 0)
  check('首条动态立即显示"刚刚"', (await text(page, '.post-card__time')) === '刚刚')
  check('成功 Toast 出现', (await text(page, '.toast')).includes('发布成功'))
  check('Toast 为成功样式', (await page.locator('.toast').getAttribute('class')).includes('toast--success'))

  // ---------- 4. 发布第二条，验证倒序 ----------
  await page.fill('#postInput', '第二条动态')
  await page.click('[data-test="publish"]')
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 2)

  const ordered = await contents(page)
  check('新动态排在最前（倒序）', ordered[0] === '第二条动态' && ordered[1] === '今天把 BigBo 跑起来了', JSON.stringify(ordered))
  check('计数更新为 2 条', (await text(page, '[data-test="feed-count"]')) === '2 条')
  check('新卡片带入场动画类', (await page.locator('.post-card').first().getAttribute('class')).includes('post-card--enter'))
  check('头像渐变已应用', ((await page.locator('.post-card .avatar').first().getAttribute('style')) || '').includes('linear-gradient'))

  // ---------- 5. localStorage 落盘 ----------
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  const stored = JSON.parse(raw)
  check('数据写入 bigbo.posts.v1', Array.isArray(stored) && stored.length === 2)
  check(
    '数据结构为 id/content/createdAt',
    stored.every((item) => typeof item.id === 'string' && item.id && typeof item.content === 'string' && typeof item.createdAt === 'number'),
    raw,
  )
  check('落盘内容与界面一致', stored.map((item) => item.content).join('|') === '今天把 BigBo 跑起来了|第二条动态')

  check('连续发布时相同提示不重复堆叠', (await page.locator('.toast').count()) === 1)

  // 等入场动画结束再截图，并确认卡片完全可见
  await page.waitForTimeout(600)
  const cardOpacities = await page.$$eval('.post-card', (nodes) =>
    nodes.map((node) => Number(getComputedStyle(node).opacity)),
  )
  check('入场动画结束后卡片完全可见', cardOpacities.every((value) => value > 0.99), cardOpacities.join(','))

  await page.screenshot({ path: path.join(OUT_DIR, '03-timeline.png'), fullPage: true })

  // ---------- 6. 刷新持久化 ----------
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.post-card')
  check('刷新后动态仍在', (await page.locator('.post-card').count()) === 2)
  check('刷新后顺序不变', (await contents(page))[0] === '第二条动态')
  check('刷新后计数保持 2 条', (await text(page, '[data-test="feed-count"]')) === '2 条')

  // 新标签页（同一浏览器上下文）同样能读到
  const secondPage = await context.newPage()
  await secondPage.goto(BASE_URL, { waitUntil: 'networkidle' })
  await secondPage.waitForSelector('.post-card')
  check('新标签页共享同一份数据', (await secondPage.locator('.post-card').count()) === 2)
  await secondPage.close()

  // ---------- 7. 字数上限与超限 ----------
  await page.fill('#postInput', 'a'.repeat(280))
  check('280 字时仍可发布', await page.locator('[data-test="publish"]').isEnabled())
  check('达上限时计数变红', (await page.locator('.counter').getAttribute('class')).includes('counter--limit'))

  // 浏览器的 maxlength 会在输入阶段截断，界面永远不会出现超限内容
  await page.fill('#postInput', 'a'.repeat(300))
  const truncatedLength = await page.evaluate(() => document.querySelector('#postInput').value.length)
  check('输入被原生 maxlength 截断到 280', truncatedLength === 280, String(truncatedLength))
  check('截断后字数统计同步为 280', (await text(page, '.counter__value')) === '280')
  check('超限不会新增卡片', (await page.locator('.post-card').count()) === 2)

  await page.fill('#postInput', 'a'.repeat(240))
  const counterClass = await page.locator('.counter').getAttribute('class')
  check('接近上限（85%）时橙色预警', counterClass.includes('counter--warn'), counterClass)

  await page.fill('#postInput', '🙂🙂🙂')
  check('emoji 按字符计数', (await text(page, '.counter__value')) === '3')

  // ---------- 8. XSS 防护 ----------
  const payload = '<img src=x onerror="window.__pwned=1">'
  await page.fill('#postInput', payload)
  await page.click('[data-test="publish"]')
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 3)

  check('正文中的 HTML 未被解析为节点', (await page.locator('.post-card__content img').count()) === 0)
  check('正文按纯文本展示', (await contents(page))[0] === payload)
  check('未触发注入脚本', (await page.evaluate(() => window.__pwned)) === undefined)

  // ---------- 9. 损坏数据降级 ----------
  await page.evaluate((key) => window.localStorage.setItem(key, '{broken json'), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.toast')
  check('损坏数据时给出提示', (await text(page, '.toast')).includes('读取本地数据失败'))
  check('损坏数据后回到空状态', await page.locator('[data-test="empty-state"]').isVisible())
  check('损坏数据后计数归零', (await text(page, '[data-test="feed-count"]')) === '0 条')

  // ---------- 10. 空状态按钮聚焦 ----------
  await page.click('[data-test="empty-state"] button')
  check('空状态按钮聚焦输入框', await page.evaluate(() => document.activeElement?.id === 'postInput'))

  // ---------- 11. 响应式截图 ----------
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.fill('#postInput', '移动端也能顺畅发布')
  await page.click('[data-test="publish"]')
  await page.waitForSelector('.post-card')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT_DIR, '04-mobile.png'), fullPage: true })

  const box = await page.locator('.layout').boundingBox()
  check('移动端布局未横向溢出', Boolean(box) && box.width <= 390, JSON.stringify(box))

  // ---------- 12. 控制台干净 ----------
  check('无未捕获的运行时错误', pageErrors.length === 0, pageErrors.join(' / '))
  check('无控制台 error', consoleErrors.length === 0, consoleErrors.join(' / '))

  await browser.close()

  console.log('\nBigBo 浏览器验收结果')
  console.log(results.join('\n'))
  console.log(`\n通过 ${results.length - failed} / ${results.length} 项，截图见 verify-output/`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('\n浏览器验收执行失败：', error)
  process.exitCode = 1
})
