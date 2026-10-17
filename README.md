# 近地小行星实时雷达 · NEO Observatory v1.1

HTML + Tailwind CSS + 原生 JavaScript + globe.gl 的沉浸式单页网页。采用已选视觉稿 1：深空背景、夜光地球、蓝色大气光晕、红青色飞掠目标、左右观测面板。

## 本地运行

需要 Node.js 20.19+ 或 22.12+，本项目已在 Node.js 20.20.2 环境验证。

```sh
cd "/Users/yu/Developer/MyIdea/04-AI星球/NEO Watch"
npm install
npm run dev
```

打开 <http://127.0.0.1:4173/>。默认端口固定为 4173，仅监听本机；如端口已占用，可运行 `npm run dev -- --port 4174`。

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4174
```

`dist/` 是构建后的静态网页；生产环境还必须提供同域 `/api/neo/today`，只上传静态文件无法获取真实数据。不要直接双击 `index.html`，请使用 HTTP 服务。

构建配置保留已有输出，不批量清理 `dist/`；历史哈希资源如需清理，请由用户手动处理。

## NASA API Key

默认使用 `DEMO_KEY`，不需要先配置。为了提高可用性，可从 [NASA Open APIs](https://api.nasa.gov/) 申请自己的 Key，并在项目根目录创建 `.env.local`：

```dotenv
VITE_NASA_API_KEY=你的NASA_API_Key
```

修改后重启开发服务。集中配置见 `src/config.js`，`.env.example` 给出了开发样例。`.env.local` 已加入 `.gitignore`；生产 Key 单独在服务器配置，修改它不需要重建前端。

开发模式仍可直接请求 NASA。生产构建改为请求同域 `/api/neo/today`，不包含本地 NASA Key；数据代理从服务器 `NASA_API_KEY` 环境变量读取 Key，合并并发请求并缓存十分钟。代理保留 NASA 获取时间，更新失败时只回退到当日缓存，并由界面明确标识。

服务器部署步骤见 [部署指南](deploy/README.md)。运行 `bash deploy/package.sh` 生成经过测试和密钥检查的独立部署包。生产构建的本地预览需要同时运行数据服务，并监听 `127.0.0.1:4180`（Vite preview 已配置 `/api` 转发）。

## 生产部署

| 方式 | 说明 |
|---|---|
| [Docker 独立部署](deploy/docker-standalone.md) | Compose 启动 web/API，默认入口 127.0.0.1:8081，支持配置 IP 和端口 |
| [Docker + 现有 NPM](deploy/docker-npm.md) | 保留已有 Nginx Proxy Manager 网络接入 |
| [非 Docker 部署](deploy/native/README.md) | 系统 Node.js 22.12+ 运行 API，systemd 常驻，宿主机 Nginx 提供页面和同域转发 |

两种方式共用版本部署包，运行主机无需安装项目 npm 依赖。生产配置样例为 `deploy/api.env.example`；`npm start` 启动 API，需由环境传入 NASA_API_KEY，不提供静态网页。统一验收命令为 `node deploy/check.mjs https://你的域名`。详细配置、更新和回退见对应指南。

`VITE_` 变量通常会包含在浏览器代码中，不能作为秘密保存。本项目仅在开发模式读取 `VITE_NASA_API_KEY`，生产部署使用上述服务端代理；不要将其他服务的密钥放入前端配置。

接口：`GET https://api.nasa.gov/neo/rest/v1/feed`。为覆盖完整北京时间日期，请求相邻两个 UTC 日期，再按 `epoch_date_close_approach` 筛选北京时间 `[00:00, 次日00:00)` 内的飞掠。[NASA 官方接口说明](https://github.com/nasa/api-docs/blob/gh-pages/assets/json/apis.json)

## 使用

- 拖拽地球旋转视角，滚轮缩放；移动端使用单指拖拽与双指缩放。
- 点击发光点或左侧目标行，展开直径、速度和 LD 距离详情，同时暂停旋转。
- 使用「全部／潜在危险」筛选，距离映射基准不变。
- 通过底部按钮暂停／继续旋转、重置视角；按 Escape 关闭详情。
- 请求失败时点击重试，或手动进入演示。演示使用虚构数据且始终有显式标识；可点击「返回真实数据」。
- 手机点击「今日目标」展开列表，点击目标后改为底部详情抽屉。
- 详情显示北京时间和 UTC 飞掠时刻、倒计时或已飞掠，并同时显示 LD 与公里。
- 点击指标旁的信息图标查看科普；Escape 关闭说明并保留原目标。点击「JPL 天体资料」查看官方天体信息。
- 浏览器保留最近一次成功获取的当日 NASA 数据。重载时先显示缓存并保留原获取时间，再尝试更新；请求失败时仍可使用缓存。演示不会覆盖真实缓存。

## 数据解释

“实时雷达”是产品名称。这里展示的是当天 NASA 飞掠记录，不是实时测量或实时位置追踪。首次打开、手动刷新和上海日期改变时请求接口，不进行高频轮询。界面标明查询日期、数据来源和最后成功更新时间。

轨道环、方向与点的位置均为示意，不是环绕地球的真实轨道。最近距离按对数缩放为地心半径 1.2～3R；原始 LD 值保留在列表与详情。缺失距离的目标仅在列表展示，不编造空间位置。`1 LD ≈ 384,400 km`。

`is_potentially_hazardous_asteroid` 表示 NASA 的潜在危险分类，不代表本次将撞击地球。所有点大小统一作可点击标记，不表示真实直径；直径范围在侧栏查看。

目标以完全匹配的正式编号或完整临时编号合并，例如 `2018 EH4` 的新旧记录只计一次；不做模糊合并。所有历史别名的统一 JPL 身份解析尚未接入。直径是根据亮度与反射能力假设得出的估算范围，不是统计置信区间。

本地缓存仅保存公开的目标数据和获取时间，不保存 API Key 或场景对象。只恢复当前北京时间日期，旧日期缓存不用于新日期统计；私密浏览或存储限制下可能无法跨刷新保留缓存。

## 文件与文档

- `src/data.js`：日期、NASA 请求、字段归一化、对数映射和演示数据。
- `src/cache.js`：当日真实数据的持久缓存、版本与字段校验。
- `src/scene.js`：globe.gl 场景、地球材质、示意轨道、目标拾取与相机。
- `src/main.js` / `src/styles.css`：页面状态、交互与响应式视觉。
- [产品设计](docs/product-design.md)、[v1.1 更新说明](docs/v1.1-release-notes.md)、[素材来源](docs/asset-sources.md)、[视觉验收](design-qa.md)。

globe.gl / Three.js 的三维运行时体积较大，已作为独立动态模块加载，列表、状态栏和 NASA 请求先启动。初次加载需要等待三维运行时和地球素材；后续资源可由浏览器缓存。

## 验证

`npm test` 验证上海午夜切换、双 UTC 日期覆盖、边界包含／排除、旧编号合并、单位解析、空数据、缺失字段、对数映射、请求错误、倒计时、缓存恢复与损坏／不可用处理，以及缓存不会保存 Key 或循环场景对象。

浏览器测试与具体证据见 `design-qa.md`。未进行 NASA 长期可用性保证或多设备性能基准测试；WebGL 不可用时提供列表与详情降级体验。
