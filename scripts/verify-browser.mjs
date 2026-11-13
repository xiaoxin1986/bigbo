/**
 * 真实浏览器 + 真实后端的验收脚本（复用本机 Chrome / Edge，不下载额外浏览器）。
 *
 * 用法：先启动服务（Hono 同时托管 API 与 dist 静态资源）
 *   npm run build && npm start
 * 再执行
 *   npm run verify:browser
 * 可用 BIGBO_URL 覆盖地址，默认 http://localhost:8787
 *
 * 与旧版的区别：数据不再写 localStorage，断言全部改成面向 REST API 与界面的一致性。
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.BIGBO_URL || 'http://localhost:8787'
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

/** 通过 Playwright 的 API 请求器访问后端：不产生页面 console error */
const api = (request, method, url, data) =>
  request.fetch(`${BASE_URL}${url}`, {
    method,
    ...(data === undefined ? {} : { data }),
  })

async function resetPosts(request) {
  const response = await api(request, 'GET', '/api/posts')
  const { posts } = await response.json()
  for (const post of posts) {
    await api(request, 'DELETE', `/api/posts/${encodeURIComponent(post.id)}`)
  }
}

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

  // ---------- 0. 后端可用性 + 清空历史数据 ----------
  const health = await api(page.request, 'GET', '/api/health')
  const healthBody = await health.json()
  check('后端健康检查返回 ok', health.ok() && healthBody.status === 'ok', JSON.stringify(healthBody))

  await resetPosts(page.request)
  const emptyList = await (await api(page.request, 'GET', '/api/posts')).json()
  check('验收开始前服务端数据已清空', Array.isArray(emptyList.posts) && emptyList.posts.length === 0)

  // ---------- 1. 空状态 ----------
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.site-header')

  check('页面标题正确', (await page.title()) === 'BigBo · 记录此刻，分享所想')
  check('品牌名渲染', (await text(page, '.brand__name')) === 'BigBo')
  check('展示服务端存储徽标', (await text(page, '.storage-badge')).includes('服务端存储'))
  check('首次进入为空状态', await page.locator('[data-test="empty-state"]').isVisible())
  check('加载态结束后不再显示"正在加载"', (await page.locator('[data-test="feed-loading"]').count()) === 0)
  check('计数为 0 条', (await text(page, '[data-test="feed-count"]')) === '0 条')
  check(
    '初始字数 0 / 280',
    (await text(page, '.counter')).replace(/\s+/g, ' ') === '0 / 280',
    await text(page, '.counter'),
  )
  check('空内容时发布按钮禁用', await page.locator('[data-test="publish"]').isDisabled())
  check(
    '不再使用 localStorage 存数据',
    (await page.evaluate(() => window.localStorage.getItem('bigbo.posts.v1'))) === null,
  )

  await page.screenshot({ path: path.join(OUT_DIR, '01-empty.png'), fullPage: true })

  // ---------- 2. 纯空白内容不可发布 ----------
  await page.fill('#postInput', '     ')
  check('纯空白内容仍禁用发布', await page.locator('[data-test="publish"]').isDisabled())
  check('空白内容计数为 5', (await text(page, '.counter__value')) === '5')

  // ---------- 3. 发布第一条（Ctrl + Enter） ----------
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
  check(
    '新动态排在最前（倒序）',
    ordered[0] === '第二条动态' && ordered[1] === '今天把 BigBo 跑起来了',
    JSON.stringify(ordered),
  )
  check('计数更新为 2 条', (await text(page, '[data-test="feed-count"]')) === '2 条')
  check('新卡片带入场动画类', (await page.locator('.post-card').first().getAttribute('class')).includes('post-card--enter'))
  check('头像渐变已应用', ((await page.locator('.post-card .avatar').first().getAttribute('style')) || '').includes('linear-gradient'))
  check('连续发布时相同提示不重复堆叠', (await page.locator('.toast').count()) === 1)

  // ---------- 5. 后端数据与界面一致 ----------
  const listResponse = await api(page.request, 'GET', '/api/posts')
  const { posts: serverPosts } = await listResponse.json()
  check('服务端保存了 2 条动态', serverPosts.length === 2, JSON.stringify(serverPosts))
  check(
    '服务端数据结构为 id/content/createdAt',
    serverPosts.every(
      (item) =>
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        typeof item.content === 'string' &&
        typeof item.createdAt === 'number',
    ),
  )
  check(
    '服务端顺序与界面一致',
    serverPosts.map((item) => item.content).join('|') === '第二条动态|今天把 BigBo 跑起来了',
    JSON.stringify(serverPosts.map((item) => item.content)),
  )
  const createdResponse = await api(page.request, 'POST', '/api/posts', { content: '接口返回头验证' })
  check('POST 返回 201', createdResponse.status() === 201, String(createdResponse.status()))
  check(
    'POST 返回 Location 头',
    (createdResponse.headers().location || '').startsWith('/api/posts/'),
    createdResponse.headers().location,
  )
  const createdPost = (await createdResponse.json()).post
  await api(page.request, 'DELETE', `/api/posts/${createdPost.id}`)

  // 最长 280 字与 281 字的服务端校验
  const tooLong = await api(page.request, 'POST', '/api/posts', { content: '字'.repeat(281) })
  const tooLongBody = await tooLong.json()
  check('服务端拒绝 281 字（400 TOO_LONG）', tooLong.status() === 400 && tooLongBody.error.code === 'TOO_LONG', JSON.stringify(tooLongBody))
  const emptyBody = await api(page.request, 'POST', '/api/posts', { content: '   ' })
  check('服务端拒绝空白内容（400 EMPTY）', emptyBody.status() === 400 && (await emptyBody.json()).error.code === 'EMPTY')
  const missing = await api(page.request, 'GET', '/api/posts/not-exist')
  check('查询不存在的动态返回 404', missing.status() === 404 && (await missing.json()).error.code === 'NOT_FOUND')
  const unknownRoute = await api(page.request, 'GET', '/api/unknown')
  check(
    '未知 API 路由返回 JSON 404',
    unknownRoute.status() === 404 && (await unknownRoute.json()).error.code === 'NOT_FOUND',
  )

  // ---------- 5.5 点赞 / 收藏（界面 + REST API 一致性） ----------
  const reactionCard = page.locator('.post-card').first()
  check(
    '初始点赞与收藏计数均为 0',
    (await reactionCard.locator('[data-test="like-count"]').innerText()) === '0' &&
      (await reactionCard.locator('[data-test="favorite-count"]').innerText()) === '0',
  )

  await reactionCard.locator('[data-test="like-post"]').click()
  await page.waitForFunction(
    () => document.querySelector('.post-card [data-test="like-count"]')?.textContent === '1',
  )
  check(
    '点击点赞后计数为 1 且按钮激活',
    (await reactionCard.locator('[data-test="like-post"]').getAttribute('aria-pressed')) === 'true' &&
      (await reactionCard.locator('[data-test="like-post"]').getAttribute('class')).includes(
        'post-card__action--active',
      ),
  )

  await reactionCard.locator('[data-test="favorite-post"]').click()
  await page.waitForFunction(
    () => document.querySelector('.post-card [data-test="favorite-count"]')?.textContent === '1',
  )
  check(
    '点击收藏后计数为 1 且按钮激活',
    (await reactionCard.locator('[data-test="favorite-post"]').getAttribute('aria-pressed')) ===
      'true' &&
      (await reactionCard.locator('[data-test="favorite-post"]').getAttribute('class')).includes(
        'post-card__action--active',
      ),
  )

  const reactedList = await (await api(page.request, 'GET', '/api/posts')).json()
  const reactedPost = reactedList.posts.find((item) => item.content === '第二条动态')
  check(
    '服务端同步保存点赞与收藏状态',
    Boolean(reactedPost) &&
      reactedPost.liked === true &&
      reactedPost.likeCount === 1 &&
      reactedPost.favorited === true &&
      reactedPost.favoriteCount === 1,
    JSON.stringify(reactedPost),
  )

  const invalidLike = await api(page.request, 'PUT', `/api/posts/${reactedPost.id}/like`, {
    liked: 'yes',
  })
  check(
    '点赞字段非布尔返回 400 INVALID_BODY',
    invalidLike.status() === 400 && (await invalidLike.json()).error.code === 'INVALID_BODY',
  )
  const missingFavorite = await api(page.request, 'PUT', '/api/posts/not-exist/favorite', {
    favorited: true,
  })
  check(
    '收藏未知动态返回 404 NOT_FOUND',
    missingFavorite.status() === 404 && (await missingFavorite.json()).error.code === 'NOT_FOUND',
  )

  await reactionCard.locator('[data-test="like-post"]').click()
  await page.waitForFunction(
    () => document.querySelector('.post-card [data-test="like-count"]')?.textContent === '0',
  )
  check(
    '再次点击可取消点赞',
    (await reactionCard.locator('[data-test="like-post"]').getAttribute('aria-pressed')) === 'false',
  )
  await reactionCard.locator('[data-test="like-post"]').click()
  await page.waitForFunction(
    () => document.querySelector('.post-card [data-test="like-count"]')?.textContent === '1',
  )
  await page.screenshot({ path: path.join(OUT_DIR, '03-reactions.png'), fullPage: true })

  // 等入场动画结束再截图，并确认卡片完全可见
  await page.waitForTimeout(600)
  const cardOpacities = await page.$$eval('.post-card', (nodes) =>
    nodes.map((node) => Number(getComputedStyle(node).opacity)),
  )
  check('入场动画结束后卡片完全可见', cardOpacities.every((value) => value > 0.99), cardOpacities.join(','))
  await page.screenshot({ path: path.join(OUT_DIR, '03-timeline.png'), fullPage: true })

  // ---------- 6. 刷新 / 新标签页共享服务端数据 ----------
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.post-card')
  check('刷新后动态仍在', (await page.locator('.post-card').count()) === 2)
  check('刷新后顺序不变', (await contents(page))[0] === '第二条动态')
  check('刷新后计数保持 2 条', (await text(page, '[data-test="feed-count"]')) === '2 条')
  check(
    '刷新后点赞与收藏状态保持',
    (await page.locator('.post-card').first().locator('[data-test="like-count"]').innerText()) ===
      '1' &&
      (await page.locator('.post-card').first().locator('[data-test="favorite-count"]').innerText()) ===
        '1',
  )

  const secondPage = await context.newPage()
  await secondPage.goto(BASE_URL, { waitUntil: 'networkidle' })
  await secondPage.waitForSelector('.post-card')
  check('新标签页读到同一份服务端数据', (await secondPage.locator('.post-card').count()) === 2)
  check(
    '新标签页共享点赞与收藏状态',
    (await secondPage.locator('.post-card').first().locator('[data-test="like-count"]').innerText()) ===
      '1' &&
      (await secondPage
        .locator('.post-card')
        .first()
        .locator('[data-test="favorite-count"]')
        .innerText()) === '1',
  )
  await secondPage.close()

  // ---------- 7. 字数上限与超限 ----------
  await page.fill('#postInput', 'a'.repeat(280))
  check('280 字时仍可发布', await page.locator('[data-test="publish"]').isEnabled())
  check('达上限时计数变红', (await page.locator('.counter').getAttribute('class')).includes('counter--limit'))

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

  // ---------- 9. 删除（DELETE /api/posts/:id） ----------
  await page.locator('.post-card').first().locator('[data-test="delete-post"]').click()
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 2)
  check('删除后卡片消失', (await page.locator('[data-test="post-list"] .post-card').count()) === 2)
  check('删除后计数为 2 条', (await text(page, '[data-test="feed-count"]')) === '2 条')
  // 上一条"发布成功"可能还在展示，所以要在整个 Toast 栈里找"已删除"
  const toastTexts = await page.locator('.toast').allInnerTexts()
  check('删除成功 Toast', toastTexts.some((item) => item.includes('已删除')), toastTexts.join(' / '))
  const afterDelete = await (await api(page.request, 'GET', '/api/posts')).json()
  check('服务端同步删除', afterDelete.posts.length === 2, JSON.stringify(afterDelete.posts.length))

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.post-card')
  check('刷新后被删除的数据不再出现', (await page.locator('.post-card').count()) === 2)

  // ---------- 10. 空状态按钮聚焦 ----------
  await resetPosts(page.request)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-test="empty-state"]')
  await page.click('[data-test="empty-state"] button')
  check('空状态按钮聚焦输入框', await page.evaluate(() => document.activeElement?.id === 'postInput'))

  // ---------- 11. 响应式截图 ----------
  await page.setViewportSize({ width: 390, height: 844 })
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

  console.log('\nBigBo 浏览器验收结果（Hono + REST + 内存存储）')
  console.log(results.join('\n'))
  console.log(`\n通过 ${results.length - failed} / ${results.length} 项，截图见 verify-output/`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('\n浏览器验收执行失败：', error)
  process.exitCode = 1
})
