# NEO Watch 开发约定

## 接手顺序与范围

1. 先读 `docs/PROJECT_CONTEXT.md`，再读 `docs/CURRENT_PROGRESS.md`。
2. 本目录是项目根目录，原名 `v1`；命令中包含空格的路径必须加引号。
3. 以实际代码为实现依据。历史设计、验收记录中的功能范围和目标数量不能直接当成当前状态；核实后更新进度文档。
4. 项目服务于“代码探索宇宙”的通俗天文科普。优先让作品好展示、知识易理解且准确；技术实现讲解、复现教程不是内容目标。

## 文件操作与敏感信息（必须遵守）

- **禁止批量删除文件或目录**，不得使用 `rm -rf`、`del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse` 或其他批量删除替代方式。
- 如需删除，只能一次处理一个明确路径的文件。需要批量清理时停止，并让用户手动处理。
- 保留 Vite 的 `build.emptyOutDir: false`。发布向新的版本目录构建，不清空旧 `dist`、发布目录或归档。
- 不在文档、代码、截图、日志和命令参数中记录账号、密码或实际密钥。只可记录配置变量名称和文件位置；诊断只输出状态、错误码等非敏感结果。
- 开发 Key 来自本地 `.env.local` 的 `VITE_NASA_API_KEY`；生产 Key 来自服务器环境变量 `NASA_API_KEY`，不能进入前端构建或浏览器缓存。
- 配置值只填 Key 本身，不能把整行 `VITE_NASA_API_KEY=…` 嵌入另一个变量的值。修改服务器环境文件后需重新创建 API 容器以载入配置，单纯 restart 不会重新读取 Compose env_file。
- 远程变更只作用于本项目；先检查现有网站、端口和 Docker 网络。不得覆盖既有网站、全局重启服务、全局清理 Docker 或修改整个 Cloudflare 区域来解决单站问题。

## 架构与模块

原生 JavaScript ES Modules + HTML + Tailwind CSS；Vite 构建；globe.gl / Three.js 渲染；Node.js 内置 HTTP 模块提供生产数据 API。没有 React、应用数据库、登录系统。

| 路径 | 职责 |
|---|---|
| `index.html`、`src/styles.css` | 页面结构、桌面面板、手机列表/抽屉和科普弹窗 |
| `src/main.js` | 状态、交互、数据源切换、日期/倒计时显示、动态加载场景 |
| `src/data.js` | 上海日期边界、NASA 请求、精确编号合并、归一化、对数映射、演示数据 |
| `src/cache.js`、`src/feed.js` | 当日缓存白名单校验、生产接口快照读取 |
| `src/config.js` | 开发/生产配置与浏览器请求超时 |
| `src/scene.js` | 地球材质、示意环、点选、高亮、相机、WebGL 降级 |
| `server/service.mjs` | 当日 API、并发合并、共享缓存、失败退避、可选磁盘缓存 |
| `deploy/` | 项目内 Nginx、Compose、独立版本打包与部署说明 |
| `tests/` | Node 原生数据与服务端测试 |

生产链路：浏览器 → 现有 Nginx Proxy Manager → 项目 web 容器 → 项目 api 容器 → NASA。web 也提供静态页面；两级代理用途不同。

## 不可破坏的数据与展示规则

- “今日”固定为 `Asia/Shanghai` 的 `[00:00, 次日00:00)`；请求覆盖相邻两个 UTC 日期，以有效飞掠 epoch 筛选 Earth 记录。
- 只按完整临时编号或正式编号精确合并，不按相似名称/距离猜测；保留来源 ID/名称。数值缺失为 `null`。
- 先对全部目标计算距离映射，再筛选；LD 原始数值不能被图形半径替换。
- 点、方位、轨道环和旋转动画是示意，不是真实位置、真实轨道或实时追踪；危险分类不等于撞击概率。
- 演示必须由用户主动进入且标明虚构，不覆盖真实缓存；错误不能静默转换为演示。
- 保留 NASA 成功获取时间。跨日旧数据不能冒充今日数据；缓存、历史、错误和演示状态要可区分。
- 生产分支在 `src/main.js` 直接使用 `import.meta.env.PROD`，开发 Key 在 `src/config.js` 受 `import.meta.env.DEV` 保护。修改时确认构建能移除浏览器直连 NASA 的代码；仅依赖普通配置对象分支曾未被完全消除。

## 开发与验证

```bash
npm test
npm run dev
npm run build
bash deploy/package.sh
```

- 本地开发默认 `http://127.0.0.1:4173/`（严格端口），开发模式直连 NASA。包脚本和依赖以 `package.json` / `package-lock.json` 为准。
- 生产预览需要同时运行数据服务于 `127.0.0.1:4180`；Vite preview 已转发 `/api`。API 服务参数：`NASA_API_KEY`、`HOST`、`PORT`、可选 `FEED_CACHE_FILE`，不得把环境文件内容打印出来。
- 数据、缓存、服务端改动运行相应测试；发布前运行打包脚本，其包含全量测试、构建和前端密钥/直连 URL 检查。不升级依赖来替代定位问题。
- 界面改动验证真实/演示、选择/筛选、科普、桌面和手机；无法运行浏览器时明确说明，不能用构建通过代替视觉验收。
- `/health` 只证明进程可用；上线必须检查 `/api/neo/today`、日期、数据时间及页面。不能以 healthy 或默认站点 HTTP 200 宣称上线成功。
- 完成工作后更新 `docs/CURRENT_PROGRESS.md`；长期架构/业务规则变化再同步 `docs/PROJECT_CONTEXT.md`。
