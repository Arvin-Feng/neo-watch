# 项目背景与关键知识

整理日期：2026-10-17（Asia/Shanghai）。本文件记录长期背景和当前代码约定；具体上线状态见 [CURRENT_PROGRESS.md](CURRENT_PROGRESS.md)。

## 产品目的与命名

**用户明确的目标**：通过可视化作品配合通俗讲解，让没有天文基础的观众理解相关知识。作品也是“代码探索宇宙”频道的科普素材，重点是好展示、有知识，不要求介绍技术实现或教观众复现。

当前围绕整个作品连续讲解，不拆分成多期。可讲清目标数、大小、相对速度、月球距离和潜在危险分类。中文/英文旁白及配音工具曾在聊天中讨论，但没有确认已生成音频或成片。

- 项目名称采用 **NEO Watch / 近地哨站**；目录已由 `v1` 改为 `NEO Watch`。
- 页面仍显示“近地小行星实时雷达 / NEO Observatory · v1.1”；`package.json` 仍为 `neo-observatory-v1`、版本 `1.1.0`。目录改名没有完成全站品牌替换。
- 目标体验：查看当天飞掠 → 选择天体 → 理解指标 → 结合画面讲解。当前没有账号、碰撞预测、真实轨道传播、历史/未来日期选择。

## 技术栈与架构（代码已核实）

HTML、原生 JavaScript ESM、Tailwind CSS 4.3.3；Vite 6.3.5；globe.gl 2.46.2、Three.js 0.180.0、Phosphor Icons 2.1.2。完整依赖以锁文件为准。项目 README 记录本地 Node.js 20.20.2 验证；生产 API 容器使用 `node:22-alpine`。

```text
开发：浏览器 → NASA NeoWs（开发 Key）
生产：浏览器 → Nginx Proxy Manager → web:8080
                                      ├─ 静态构建页面/素材
                                      └─ /api/neo/today → api:8080 → NASA
```

API 复用 `src/data.js` 的日期、请求及归一化函数，并复用 `src/cache.js` 校验磁盘快照。没有新增第三方服务端框架。三维模块由前端动态 import，数据和基础界面先启动。

## 业务与天文解释规则

| 主题 | 当前实现/解释 |
|---|---|
| 今日范围 | `Asia/Shanghai` 当天半开区间；获取跨越的两个 UTC 日期，按 `epoch_date_close_approach` 毫秒筛选 Earth 记录；缺少有效时刻不计入 |
| 统一身份 | 优先识别完整临时编号，再识别正式编号，否则回退 NASA ID；不做模糊匹配 |
| 同天体多条记录 | 展示当日公里距离最小的一次；有正式编号来源时优先其名称和危险分类，保留源记录追溯；按合并后的天体统计数量 |
| 数值与单位 | 直径米、速度 km/s、距离 LD/km；缺失/非法/负数为 `null`；`1 LD = 384400 km`，某距离字段缺失时可从另一个换算 |
| 图形距离 | 对当天全部有效公里距离取 `log1p`，归一化映射至地心半径 1.2～3 倍；只有一个/同距目标取 2.1 倍；缺失距离只在列表展示 |
| 筛选 | 在映射之后筛选，避免同一批数据切换分类时半径跳变；不同日期的图形半径不宜直接比较 |
| 示意范围 | 倾角/相位由 ID 散列生成；环不代表绕地球的真实轨道，画面不跟踪实际位置；标记大小是交互/类别表现，不是真实直径，危险标记在代码中更大 |
| 危险分类 | 采用 NASA 布尔值；不等于本次撞击或撞击概率。青色为未标记潜在危险，红色为潜在危险 |
| 大小与速度解释 | 直径是估算范围而非统计置信区间；速度是相对地球的飞掠速度，不控制动画速度 |
| 刷新 | 首次、手动和上海日期变化时请求；每 30 秒只检查日期/更新倒计时，不进行固定频率 NASA 轮询 |
| 演示 | 12 个虚构目标，其中 2 个危险标记；主动进入、显式标识，不写入真实缓存，不显示天体查询链接 |

## 接口与存储约定

NASA 上游为 `GET https://api.nasa.gov/neo/rest/v1/feed`，带 `start_date`、`end_date`、服务器保管的 `api_key`。浏览器生产环境只请求本站接口。

### 本站 API

- `GET /health` → `{"status":"ok"}`，只检测进程。
- `GET /api/neo/today` → 当前上海日期快照，无查询参数；不接受客户端指定历史日期或上游 URL。
- 成功结构（字段类型示意，不是当前天文数据）：

```text
{ version: 2, date: "YYYY-MM-DD", fetchedAt: "ISO8601",
  items: [归一化目标], stale: boolean }
```

- `stale: true` 表示上游更新失败、返回同一上海日期的旧缓存；正常 TTL 内缓存命中仍为 `false`。`fetchedAt` 始终为上游成功获取时间。
- 无当日可用数据且上游失败：HTTP 503、`{"error":"NASA data temporarily unavailable"}`。其他路径 404、非 GET 405；含查询字符串的路径也不匹配当前接口。
- 响应 `Cache-Control: no-store`。缓存由服务内部管理，不能把浏览器收到响应的时间当作 NASA 获取时间。

### 目标模型

| 字段 | 约定 |
|---|---|
| `id`, `name`, `designation` | 稳定身份键、展示名称、正式/临时编号（可为 null） |
| `hazardous` | NASA 分类布尔值 |
| `diameterMin`, `diameterMax`, `velocity` | 米、米、km/s；可为 null |
| `distanceLD`, `distanceKm` | 真实距离；可为 null |
| `approachAt`, `approachDate` | 飞掠 Unix 毫秒与对应上海日期 |
| `jplUrl`, `sourceIds`, `sourceNames` | 官方查询链接及合并来源；演示无官方天体链接 |
| `radius`, `distanceMapped` | 仅前端映射增加，不作为原始业务数据持久保存 |

**没有应用数据库和表结构**。服务器上存在的 PostgreSQL 属于既有环境，本项目没有接入。

- 浏览器：localStorage 键 `neo-observatory:feed:v2`，存 `{version,date,fetchedAt,items}`，白名单校验后仅恢复当日数据；真实数据刷新失败时可保留已载入数据并明确其日期。
- 服务端：按需更新、TTL 600000 ms、失败退避 30000 ms、合并并发请求；上游超时 12 秒，浏览器超时 15 秒。
- 磁盘缓存由 `FEED_CACHE_FILE` 可选启用；部署映射到共享缓存目录，先写临时文件再 rename。启动时仅恢复当天合法快照，缓存保存失败不阻止已获取结果返回。

## 展示与部署决策

- 深空背景、蓝色大气、夜间灯光、红青标记；桌面左右面板、700px 移动断点、手机列表和底部详情抽屉。选择目标暂停旋转；筛掉选中项则关闭详情；Escape 支持详情/科普关闭。
- WebGL 初始化或纹理异常有降级说明；隐藏标签页暂停渲染。地球纹理在本地 `public/assets/`，来源/署名见 [asset-sources.md](asset-sources.md)。
- 生产使用现有 Nginx Proxy Manager 处理域名/证书，项目 web 容器提供静态资源及 API 转发。Compose 没有发布宿主机端口。
- `techainetwork` 是现有外部代理网络，NPM 通过 `neo-watch-web:8080` 访问项目；web→api 使用独立 backend 网络和 Docker DNS。镜像 PORTS 中的 `80/tcp` 不等于本项目实际监听端口。
- `deploy/package.sh` 测试后构建到新时间戳目录，检查前端不含本地 Key/直接 NASA feed URL，仅打包运行所需文件；不打包本地环境文件与 node_modules。
- 保留旧发布版本及共享配置，固定 Compose 项目名 `neo-watch`；更新/回退会重建本项目容器，可能有短暂中断，不是已经实现的零停机切换。

## 文档证据边界

`docs/product-design.md`、`docs/v1.1-release-notes.md` 和 `design-qa.md` 保留原阶段记录。其中“原 v1 路径”“没有后端/服务端代理”“22 项测试”等描述不代表最新实现；当前已有生产 API，测试数量以运行结果为准。历史不同日期/口径的目标数不应写死到产品。
