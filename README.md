# BigBo

一个极简动态时间线应用：写下此刻的想法，内容立刻出现在时间线顶部。

本项目采用前后端分离结构：

- **前端**：Vue 3 + Pinia + Vite，只负责渲染与交互；
- **后端**：Hono + RESTful API + **内存存储**，负责校验、生成 id 与时间、保存数据。

数据不再写入浏览器 `localStorage` —— 刷新、换标签页、换浏览器都能看到同一份数据（同一服务进程内）。

> 内存存储意味着**服务进程重启后数据清空**，这是本项目的刻意取舍：无需数据库即可演示完整的 REST 生命周期。

## 快速开始

```bash
npm install                  # Node.js >= 20.19
npm run dev                  # 同时启动 Hono(8787) 与 Vite(5173)，打开 http://localhost:5173
npm run dev:web              # 只启动前端（需另行启动后端）
npm run dev:server           # 只启动后端，--watch 热重启
npm run build                # 构建前端到 dist/
npm start                    # Hono 同时托管 dist 与 /api，打开 http://localhost:8787
npm test                     # 全量测试：前端 jsdom + 后端 node
npm run test:server          # 只跑后端测试
npm run verify:browser       # 真实浏览器端到端验收（需先 npm run build && npm start）
```

开发模式下 Vite 通过 `/api` 代理把请求转发到 `http://localhost:8787`（见 `vite.config.js`），因此前端代码里始终只写相对路径。

## 功能

| 功能 | 说明 |
| --- | --- |
| 发布动态 | 点击「发布」或按 `Ctrl / ⌘ + Enter`，请求成功后才出现在时间线顶部 |
| 删除动态 | 卡片右上角「删除」，服务端删除成功后才从列表移除 |
| 点赞 / 收藏 | 卡片底部可点赞、收藏或再次点击取消；计数与激活状态由服务端保存，刷新后保持 |
| 时间线查看 | 按 `createdAt` 倒序展示，包含稳定渐变头像、作者、相对时间与正文 |
| 服务端持久化 | 数据保存在 Hono 进程内存中，刷新 / 新标签页 / 换浏览器均可见 |
| 输入校验 | 空白内容不可发布；前端实时字数统计（280 上限），服务端再做一次权威校验 |
| 图片动态 | 支持 JPG / PNG / GIF / WebP，浏览器侧压缩后以 data URL 提交 |
| 空状态引导 | 无动态时展示引导卡片，点击按钮聚焦输入框 |
| 加载与异常 | 首屏展示加载态；服务端不可用时降级为空时间线并明确提示 |
| 交互反馈 | 发布 / 删除成功失败均有底部 Toast；新卡片带入场动画；相同提示不重复堆叠 |
| 响应式 | 桌面端 640px 居中单列，移动端全宽卡片，适配 `prefers-reduced-motion` |

## RESTful API

基地址 `/api`，请求与响应均为 JSON（`DELETE` 成功为 204 无正文）。统一错误体：

```json
{ "error": { "code": "TOO_LONG", "message": "内容超出 280 字上限" } }
```

| 方法与路径 | 请求体 | 成功 | 失败 |
| --- | --- | --- | --- |
| `GET /api/health` | — | `200 { status: "ok", uptime }` | — |
| `GET /api/posts` | — | `200 { posts: Post[] }`，`createdAt` 倒序 | — |
| `GET /api/posts/:id` | — | `200 { post: Post }` | `404 NOT_FOUND` |
| `POST /api/posts` | `{ content?: string, image?: { dataUrl, name? } }` | `201 { post: Post }` + `Location` | `400 EMPTY / TOO_LONG / INVALID_BODY` |
| `DELETE /api/posts/:id` | — | `204` | `404 NOT_FOUND` |
| `PUT /api/posts/:id/like` | `{ liked: boolean }` | `200 { post: Post }` | `400 INVALID_BODY / 404 NOT_FOUND` |
| `PUT /api/posts/:id/favorite` | `{ favorited: boolean }` | `200 { post: Post }` | `400 INVALID_BODY / 404 NOT_FOUND` |
| 其他 `/api/*` | — | — | `404 NOT_FOUND`（JSON） |

服务端规则：

1. `content` 统一 `trim()`，字符数按 Unicode 码点计（emoji 计 1 个），上限 280；
2. 「无正文且无图片」返回 `EMPTY`；超过上限返回 `TOO_LONG`；
3. `id` 由服务端 `crypto.randomUUID()` 生成，`createdAt` 由服务端时间生成，客户端不可指定；
4. `image.dataUrl` 超过 4,000,000 字符视为非法；
5. 点赞 / 收藏使用显式布尔状态，接口幂等；字段非布尔返回 `INVALID_BODY`；
6. 所有路径（含未知路由）都返回 JSON，不会漏出 Hono 默认的纯文本 404。

## TDD 实施过程

整个改造遵循 Red → Green → Refactor，前后端各由一名子代理完成「先写测试、再写实现」，主会话负责契约设计、落盘、Code Review 与真实浏览器验收。

| 阶段 | 先写的测试 | 初始状态 | 实现后 |
| --- | --- | --- | --- |
| 1. 后端纯函数层 | `tests/server/validation.spec.js`（32 例） | 3 个后端 spec 文件全部因模块缺失而失败 | 全绿 |
| 2. 后端存储层 | `tests/server/store.spec.js`（17 例） | 同上 | 全绿 |
| 3. 后端 HTTP 层 | `tests/server/api.spec.js`（32 例） | 同上 | 全绿 |
| 4. 前端 API 客户端 | `tests/lib/api.spec.js`（25 例） | 前端新测试 15 例失败、2 个测试文件无法加载 | 全绿 |
| 5. 前端状态与组件 | `tests/stores/posts.spec.js`、`tests/components/App.spec.js` 等 | 同上 | 全绿 |
| 6. 端到端 | `scripts/verify-browser.mjs`（59 项断言） | — | 59 / 59 通过 |

点赞 / 收藏迭代采用 **Git Worktree** 将 `feature/like-favorite-backend` 与 `feature/like-favorite-frontend` 隔离开发，两个子代理并行复核实现与测试契约，主会话合并两条分支后执行全量测试、生产构建和真实浏览器验收。

当前验收结果：

- 单元 / 集成测试：**268 例全部通过**（13 个测试文件，其中后端 108 例跑在 node 环境）
- 生产构建：`vite build` 通过
- 真实浏览器（本机 Chrome，Playwright 驱动）+ 真实后端：**68 项断言全部通过**，输出桌面端 / 移动端截图到 `verify-output/`

## 目录结构

```
bigbo/
├── index.html                     # Vite 入口
├── vite.config.js                 # Vite + Vitest 配置，含 /api 代理
├── server/                        # 后端（Hono）
│   ├── app.js                     # 纯 API 应用：路由 / 校验编排 / 统一错误
│   ├── validation.js              # 请求体校验与归一化（纯函数）
│   ├── store.js                   # 内存存储：list / get / create / remove / setLike / setFavorite / clear
│   └── index.js                   # 入口：监听端口 + 托管 dist 静态资源
├── src/
│   ├── main.js                    # createApp + createPinia
│   ├── App.vue                    # 编排：加载、发布、删除、点赞、收藏、Toast、每分钟刷新时间
│   ├── styles.css                 # 设计令牌 / 玻璃拟态 / 动效 / 响应式
│   ├── components/
│   │   ├── AppHeader.vue          # 品牌栏 + 服务端存储徽标
│   │   ├── PostComposer.vue       # 受控输入、字数统计、快捷键、图片选择
│   │   ├── PostCard.vue           # 单条动态 + 删除 / 点赞 / 收藏操作
│   │   ├── EmptyState.vue         # 空状态引导
│   │   └── ToastStack.vue         # 底部提示容器（aria-live）
│   ├── composables/
│   │   └── useToast.js            # Toast 队列：自动消失、去重、上限 3 条
│   ├── lib/
│   │   ├── api.js                 # API 客户端：请求、结构校验、错误收敛
│   │   ├── image.js               # 图片读取 / 压缩 / 校验
│   │   └── time.js                # 字符计数、时间格式化、头像渐变（纯函数）
│   └── stores/
│       └── posts.js               # Pinia store：hydrate / publish / remove / toggleLike / toggleFavorite
├── tests/
│   ├── server/                    # 后端测试（node 环境）
│   ├── lib/  stores/  components/ composables/   # 前端测试（jsdom）
│   └── setup.js                   # 环境兼容的全局清理（localStorage / 全局替身）
├── scripts/
│   ├── dev.mjs                    # 一条命令同时启动前后端
│   └── verify-browser.mjs         # 真实浏览器 + 真实后端验收
└── README.md
```

## 架构与数据流

```
组件事件 → App.handleSubmit → store.publish(content, { image })
                                 ├─ 本地校验（EMPTY / TOO_LONG，避免无谓请求）
                                 ├─ apiClient.createPost()  →  POST /api/posts
                                 │      ├─ 服务端再校验一次并生成 id / createdAt
                                 │      └─ 写入内存 store
                                 └─ 成功后才更新内存状态（失败则什么都不改）
                                          ↓
                    sortedPosts（倒序派生）→ PostCard 列表重绘
```

- **server 层**：`validation.js` 是纯函数，`store.js` 只管内存读写（可注入 `now` / `createId` 便于测试），`app.js` 只做路由编排，`index.js` 才碰端口与文件系统 —— 因此 API 测试不需要起服务器。
- **前端 lib 层**：`api.js` 把网络异常、非 JSON 响应、结构非法的条目全部收敛成 `{ ok, code | reason }`，上层不需要 `try/catch`。
- **stores 层**：唯一数据源。`hydrate` / `publish` / `remove` / `toggleLike` / `toggleFavorite` 都是「服务端成功 → 再改内存」，不会出现「界面看得到、服务端没存下」的脏状态。
- **组件层**：`PostComposer` 是受控组件，只负责交互与展示；`App` 负责把结果翻译成 Toast。

## 数据结构

后端内存中的一条动态：

```json
{
  "id": "b3f1c8a2-4d7e-4a91-9c3f-0a6b2e5d7f10",
  "content": "今天把 BigBo 跑起来了",
  "createdAt": 1763001600000,
  "image": { "dataUrl": "data:image/jpeg;base64,...", "name": "photo.jpg" },
  "liked": true,
  "favorited": false,
  "likeCount": 1,
  "favoriteCount": 0
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 服务端生成的 UUID |
| `content` | string | 纯文本正文，渲染时仅通过插值写入 |
| `createdAt` | number | 服务端毫秒时间戳，用于倒序与相对时间 |
| `image` | object? | 可选；纯图片动态允许 `content` 为空串 |
| `liked` | boolean | 当前是否已点赞，默认 `false` |
| `favorited` | boolean | 当前是否已收藏，默认 `false` |
| `likeCount` | number | 点赞数；单用户演示中为 `0` 或 `1` |
| `favoriteCount` | number | 收藏数；单用户演示中为 `0` 或 `1` |

前端还会对服务端返回的每条记录做一次结构校验：缺 `id`、`createdAt` 非有限数字、`image` 缺 `dataUrl` 的条目会被直接丢弃，避免一条脏数据拖垮整个列表；点赞 / 收藏字段缺失时补齐默认值，非法值归一化为未互动与 `0`。

## 错误处理矩阵

| 场景 | 代码位置 | 行为 |
| --- | --- | --- |
| 空白内容 | `store.publish` → `EMPTY` | 提示「先写点什么再发布吧」，不发请求，输入保留 |
| 超过 280 字 | `store.publish` → `TOO_LONG` | 提示「内容超出 280 字上限」，不发请求 |
| 服务端拒绝 | `api.createPost` 透传 `EMPTY/TOO_LONG/INVALID_BODY` | 直接展示服务端文案，本地状态不变 |
| 服务端不可用 | `api.createPost` → `NETWORK` | 提示「服务端不可用，内容未能保存」，输入与图片保留 |
| 加载失败 | `store.hydrate` → `recovered` | 提示「读取服务端数据失败，已从空白开始」，页面仍可用 |
| 删除失败 | `api.deletePost` → `NETWORK / NOT_FOUND` | 提示「删除失败，请稍后重试」，卡片保留 |
| 点赞 / 收藏失败 | `store.toggleLike / toggleFavorite` → `NETWORK / SERVER / NOT_FOUND` | 提示对应错误，卡片原状态不变 |
| 未知 API 路由 | `server/app.js` → `notFound` | `404` + JSON 错误体 |
| 服务端异常 | `server/app.js` → `onError` | `500` + JSON 错误体，进程不崩 |

## 测试与验收

```bash
npm test                 # 268 例：后端 108 + 前端 160
npm run build            # 生产构建
npm start                # 另开终端，启动 8787（同时托管 dist）
npm run verify:browser   # 68 项断言（真实 Chrome + 真实后端）
```

后端测试直接调用 `app.request()`，不需要监听端口；前端测试用 `vi.stubGlobal('fetch', ...)` 提供内存型假服务端。

浏览器验收覆盖：健康检查、空状态、发布与倒序、`Ctrl+Enter`、输入清空、计数、Toast 样式与去重、服务端数据与界面一致性、`Location` 头、`400 EMPTY / TOO_LONG / INVALID_BODY`、`404 NOT_FOUND`、JSON 错误体、点赞 / 取消点赞、收藏与激活态、反应状态在刷新和新标签页中的持久化、字数上限与 85% 预警、emoji 计数、HTML 注入防护、删除与刷新后不复活、空状态聚焦、移动端不横向溢出、控制台无报错，并输出 `verify-output/*.png` 截图。

## 安全说明

- 正文通过 Vue 插值渲染，不存在 `v-html` / `innerHTML` 拼接，天然免疫脚本注入；
- 服务端只接受已知字段，并对类型、长度、图片 dataUrl 做显式校验；
- 不使用 `eval`、`new Function`；
- 无鉴权与多用户隔离，纯本地演示用途。

## 浏览器兼容

面向现代常青浏览器（Chrome / Edge / Firefox / Safari 近两年版本）。后端要求 Node.js >= 20.19（`crypto.randomUUID`、内置 `fetch`）。
