# BigBo

一个极简动态时间线应用：写下此刻的想法，内容立刻出现在时间线顶部，并保存在浏览器 `localStorage` 中，刷新或下次打开依然还在。

本项目是原「纯 HTML + CSS + 原生 JS」版本的 **TDD 重写版**，技术栈换成 **Node.js + Vue 3 + Pinia + Vite**，数据存储仍然使用 Local Storage，并且沿用旧版的存储 key，历史数据可直接读取。

## 快速开始

```bash
npm install      # 安装依赖（Node.js >= 20.19）
npm run dev      # 开发模式，默认 http://localhost:5173
npm test         # 全量单元 / 组件测试（Vitest + jsdom）
npm run build    # 生产构建，输出 dist/
npm run preview  # 预览生产构建
npm run verify:browser   # 真实浏览器端到端验收（需先启动 dev 或 preview）
```

## 功能

| 功能 | 说明 |
| --- | --- |
| 发布动态 | 点击「发布」或按 `Ctrl / ⌘ + Enter`，内容立即出现在时间线顶部 |
| 时间线查看 | 按发布时间倒序展示，包含稳定渐变头像、作者、相对时间与正文 |
| 本地持久化 | 数据以 JSON 存放在 `localStorage`，刷新、关闭重开、新标签页均可见 |
| 输入校验 | 空白内容不可发布；实时字数统计，280 字上限，接近上限变橙、达上限变红 |
| 空状态引导 | 无动态时展示引导卡片，点击按钮聚焦输入框 |
| 交互反馈 | 发布成功 / 失败均有底部 Toast；新卡片带入场动画；相同提示不重复堆叠 |
| 异常兜底 | JSON 损坏、隐私模式、配额超限都不会白屏，会降级并明确提示 |
| 响应式 | 桌面端 640px 居中单列，移动端全宽卡片，适配 `prefers-reduced-motion` |

## TDD 实施过程

整个改写严格遵循 Red → Green → Refactor，每一层都是先写测试、确认失败、再写实现。

| 阶段 | 先写的测试 | 初始状态 | 实现后 |
| --- | --- | --- | --- |
| 1. 纯函数层 | `tests/lib/time.spec.js`（17 例）、`tests/lib/id.spec.js`（4 例） | 模块不存在，3 个测试文件全红 | 全绿 |
| 2. 仓储层 | `tests/lib/storage.spec.js`（14 例） | 同上 | 全绿 |
| 3. 状态层 | `tests/stores/posts.spec.js`（15 例） | 同上 | 全绿 |
| 4. 组件层 | `tests/components/*.spec.js`、`tests/composables/useToast.spec.js`（47 例） | 6 个测试文件找不到实现而失败 | 全绿 |
| 5. 端到端 | `scripts/verify-browser.mjs`（47 项断言） | — | 47 / 47 通过 |

当前验收结果：

- 单元 / 组件测试：**97 例全部通过**（10 个测试文件）
- 生产构建：`vite build` 通过
- 真实浏览器（本机 Chrome，Playwright 驱动）：**47 项断言全部通过**，并输出桌面端 / 移动端截图到 `verify-output/`

## 目录结构

```
bigbo/
├── index.html                     # Vite 入口，挂载 #app
├── vite.config.js                 # Vite + Vitest 统一配置
├── package.json
├── src/
│   ├── main.js                    # createApp + createPinia
│   ├── App.vue                    # 编排：恢复数据、发布、Toast、每分钟刷新时间
│   ├── styles.css                 # 设计令牌 / 玻璃拟态 / 动效 / 响应式
│   ├── components/
│   │   ├── AppHeader.vue          # 品牌栏 + 本地存储徽标
│   │   ├── PostComposer.vue       # 受控输入、字数统计、快捷键、发布按钮
│   │   ├── PostCard.vue           # 单条动态（相对时间由 now 驱动）
│   │   ├── EmptyState.vue         # 空状态引导
│   │   └── ToastStack.vue         # 底部提示容器（aria-live）
│   ├── composables/
│   │   └── useToast.js            # Toast 队列：自动消失、去重、上限 3 条
│   ├── lib/
│   │   ├── time.js                # 字符计数、时间格式化、头像渐变（纯函数）
│   │   ├── id.js                  # crypto.randomUUID + 兜底
│   │   └── storage.js             # localStorage 仓储：读写、结构校验、异常降级
│   └── stores/
│       └── posts.js               # Pinia store：posts / sortedPosts / publish / hydrate
├── tests/                         # 与 src 结构镜像的测试
│   ├── lib/  stores/  components/  composables/
│   └── setup.js                   # 每个用例前后清空 localStorage
├── scripts/
│   └── verify-browser.mjs         # 真实浏览器端到端验收
└── README.md
```

## 架构与数据流

```
组件事件 → App.handleSubmit → store.publish(content)
                                 ├─ 校验（EMPTY / TOO_LONG）
                                 ├─ writePosts() 先落盘
                                 └─ 成功后更新内存状态（失败则回滚）
                                          ↓
                    sortedPosts（倒序派生）→ PostCard 列表重绘
```

- **lib 层**：纯函数与 localStorage 适配，不依赖 Vue，可单独测试；所有存储异常收敛为 `{ ok, reason }`。
- **stores 层**：Pinia setup store，唯一数据源；`publish` 采用「先落盘、后更新内存」的顺序，写入失败不会污染界面状态。
- **组件层**：`PostComposer` 是受控组件（`v-model`），只负责交互与展示，业务规则集中在 store。
- **时间刷新**：store 维护 `now`，`App` 每 60 秒调用 `tick()`，卡片相对时间随之更新，无需重载列表。

## 数据结构

`localStorage` key 与旧版一致：`bigbo.posts.v1`

```json
[
  {
    "id": "b3f1c8a2-4d7e-4a91-9c3f-0a6b2e5d7f10",
    "content": "今天把 BigBo 跑起来了",
    "createdAt": 1763001600000
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识，优先 `crypto.randomUUID()`，不可用时时间戳 + 随机数兜底 |
| `content` | string | 纯文本正文，渲染时仅通过插值 / `textContent` 写入 |
| `createdAt` | number | 创建时间毫秒时间戳，用于倒序与相对时间 |

读取时逐条校验字段类型，非法条目被过滤；JSON 损坏或顶层非数组时整体降级为空列表并给出提示。

## 错误处理矩阵

| 场景 | 代码位置 | 行为 |
| --- | --- | --- |
| 空白内容 | `store.publish` → `EMPTY` | 提示「先写点什么再发布吧」，面板输入保留 |
| 超过 280 字 | `store.publish` → `TOO_LONG` | 提示「内容超出 280 字上限」，不落盘（输入框另有原生 `maxlength` 兜底） |
| 写入失败 | `store.publish` → `STORAGE` | 提示「本地存储不可用，内容未能保存」，内存状态回滚、输入保留 |
| 数据损坏 | `store.hydrate` / `readPosts` | 提示「读取本地数据失败，已从空白开始」，页面正常可用 |
| 存储不可访问 | `readPosts` / `writePosts` | 返回 `{ ok: false, reason: 'unavailable' }`，不抛异常 |

## 测试与验收

```bash
npm test                 # 97 例：lib 35 + store 15 + 组件/组合式 47
npm run build            # 生产构建
npm run dev              # 另开终端
npm run verify:browser   # 47 项浏览器断言（自动复用本机 Chrome / Edge）
```

浏览器验收覆盖：空状态、发布与倒序、`Ctrl+Enter`、输入清空、计数、Toast 样式与去重、`localStorage` 内容结构、刷新与新标签页持久化、字数上限与 85% 预警、emoji 计数、HTML 注入防护、损坏数据降级、空状态聚焦、移动端不横向溢出、控制台无报错，并输出 `verify-output/*.png` 截图。

## 安全说明

- 正文通过 Vue 插值渲染，不存在 `v-html` / `innerHTML` 拼接，天然免疫脚本注入；
- 不使用 `eval`、`new Function`；
- 无任何后端请求，数据只留在当前浏览器。

## 浏览器兼容

面向现代常青浏览器（Chrome / Edge / Firefox / Safari 近两年版本）。`crypto.randomUUID` 不可用时会自动退回兜底 id 生成策略。
