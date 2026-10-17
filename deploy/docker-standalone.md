# 独立 Docker Compose 部署

不依赖 Nginx Proxy Manager 或已有 Docker 网络。构建机需要 Node.js 22.12+、npm；运行主机只需要 Docker Engine 和 Compose。使用 [部署总览](README.md) 生成的同一份部署包。

`compose.standalone.yaml` 启动项目 web/api 两个容器，默认只向宿主机 127.0.0.1:8081 发布网页；API 只在项目 backend 网络提供服务。此文件与原有 NPM 用 compose.yaml 二选一，不叠加使用，不同时启动。

## 配置和启动

服务器以 root 执行。先检查现有端口、容器、同名 Compose 项目和目录，保留其他网站。首次准备配置/缓存：

```bash
mkdir -p /opt/neo-watch/releases /opt/neo-watch/shared/cache
chown 1000:1000 /opt/neo-watch/shared/cache
chmod 700 /opt/neo-watch/shared/cache
```

首次创建 `/opt/neo-watch/shared/api.env`，参照包内 `deploy/api.env.example`，用编辑器填写 NASA_API_KEY；权限设为 600，所有者 root。已有配置时保留。只填 Key 本身，不嵌入变量名前缀，不使用 DEMO_KEY，不输出配置内容。

上传包后代入实际路径和版本号：

```bash
neo_watch_release=版本号
mkdir "/opt/neo-watch/releases/$neo_watch_release"
tar -xzf "/tmp/neo-watch-$neo_watch_release.tar.gz" -C "/opt/neo-watch/releases/$neo_watch_release"
cd "/opt/neo-watch/releases/$neo_watch_release"
docker compose -f deploy/compose.standalone.yaml config --quiet
docker compose -f deploy/compose.standalone.yaml pull
docker compose -f deploy/compose.standalone.yaml up -d --wait
docker compose -f deploy/compose.standalone.yaml ps
```

默认访问 `http://127.0.0.1:8081`。检查页面身份和数据（运行主机无需额外安装 Node）：

```bash
docker compose -f deploy/compose.standalone.yaml exec -T api node deploy/check.mjs http://web:8080
curl -fsS http://127.0.0.1:8081/health
curl -fsS http://127.0.0.1:8081/api/neo/today
```

检查器在内部链路验证页面及真实 API；仍应从浏览器验证主机映射端口、桌面/手机和最终 HTTPS 入口。health 成功不等于数据获取成功。

## 端口、IP 与 HTTPS

以下变量用于 Compose 插值，通过 shell 或 --env-file 配置，与 API 的 api.env 作用不同。诊断使用 `config --quiet`，不要输出普通 config 中解析后的 Key。

| 变量 | 默认值 | 用途 |
|---|---|---|
| NEO_WEB_BIND | 127.0.0.1 | 设为 0.0.0.0 时允许主机 IP 访问 |
| NEO_WEB_PORT | 8081 | 主机空闲端口 |
| NEO_ENV_FILE | /opt/neo-watch/shared/api.env | 服务端配置文件绝对路径 |
| NEO_CACHE_DIR | /opt/neo-watch/shared/cache | 缓存目录绝对路径，容器 UID/GID 1000 需可写 |

例如需要直接 IP:8081 访问，先检查该端口及防火墙/安全组，然后执行：

```bash
NEO_WEB_BIND=0.0.0.0 NEO_WEB_PORT=8081 docker compose -f deploy/compose.standalone.yaml up -d --wait
```

域名与 HTTPS 交给现有宿主机代理转发至 `http://127.0.0.1:8081`。使用容器版 NPM 时优先采用 [专用网络方案](docker-npm.md)。

## 更新、回退和改 Key

更新：在新版本目录执行该版本的 up -d --wait；固定项目名 neo-watch 会替换本项目容器。回退时进入旧版本目录，执行 up -d --force-recreate --wait。每次带相同 NEO_* 设置，可将非敏感设置放在 `/opt/neo-watch/shared/compose.env` 并一直使用 `docker compose --env-file /opt/neo-watch/shared/compose.env -f ...`，避免端口或路径恢复默认。

修改 api.env 后执行：

```bash
docker compose -f deploy/compose.standalone.yaml up -d --force-recreate --wait api
```

仅 restart 不会重新加载 Compose 的 env_file。Key、缓存、旧版本和上传归档保留，不自动清理。切换非 Docker 部署时先停止本项目容器，再按 [非 Docker 指南](native/README.md) 调整缓存所有权。
