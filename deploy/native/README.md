# 非 Docker 部署：Node.js + systemd + Nginx

适用 Linux/systemd 主机（如 Debian 12）。构建机需要 Node.js 22.12+ 和 npm；运行主机需要 Node.js 22.12+、Nginx、systemd，无需 Docker，也无需安装项目 npm 依赖。API 只使用 Node.js 内置模块。

链路：浏览器 → 宿主机 Nginx（静态页面与同域 API）→ `127.0.0.1:4180` → NASA。Nginx 模板默认监听 `127.0.0.1:8081`，供现有宿主机反向代理接入；API 不对公网开放。

以下命令在服务器以 root 执行；构建和上传参见 [部署总览](../README.md)。先确认 4180、8081 端口空闲，检查已有站点、同名服务、目录和配置文件，不覆盖其他项目。两种部署方式共用默认缓存路径，切换时先停止本项目另一种运行方式，再调整缓存所有权，不同时运行。

## 1. 准备账户与配置（首次）

```bash
node --version
command -v node
ss -ltnp
getent passwd neo-watch || useradd --system --user-group --home-dir /opt/neo-watch --shell /usr/sbin/nologin neo-watch
mkdir -p /opt/neo-watch/releases /opt/neo-watch/shared
install -d -m 700 -o neo-watch -g neo-watch /opt/neo-watch/shared/cache
```

服务使用 `/usr/bin/node`。若 `command -v node` 指向其他系统级路径，安装服务后将 `ExecStart` 改为该绝对路径；不能依赖交互 shell 的 nvm 初始化或 `/root` 下的 Node（服务启用了 ProtectHome）。

首次创建 `/opt/neo-watch/shared/api.env`，参照部署包里的 `deploy/api.env.example`，用编辑器填入 `NASA_API_KEY`。权限设为 600、所有者 root；已有配置则保留。只填写 Key 本身，不嵌入变量名前缀，不使用 DEMO_KEY，不输出文件内容。systemd 负责读取配置并传给服务账户。改 Key 后重启本项目 API 即可重新加载。

## 2. 解包与选择版本

将版本号和上传路径替换为实际值；部署包由 `bash deploy/package.sh` 生成：

```bash
neo_watch_release=版本号
mkdir "/opt/neo-watch/releases/$neo_watch_release"
tar -xzf "/tmp/neo-watch-$neo_watch_release.tar.gz" -C "/opt/neo-watch/releases/$neo_watch_release"
test -f "/opt/neo-watch/releases/$neo_watch_release/dist/index.html"
test -f "/opt/neo-watch/releases/$neo_watch_release/server/service.mjs"
test ! -e /opt/neo-watch/current || test -L /opt/neo-watch/current
ln -sfnT "/opt/neo-watch/releases/$neo_watch_release" /opt/neo-watch/current
```

逐条确认成功后继续。current 只允许不存在或为软链接；如果它是普通目录，先人工检查，不能覆盖。所有旧版本目录保留。发布目录、父目录和静态资源需允许服务账户及 Nginx worker 读取/遍历；不要开放 shared 配置文件权限。

## 3. 安装 API 常驻服务（首次）

确认目标路径无冲突后执行；已有本项目配置时检查差异后再更新：

```bash
install -m 644 /opt/neo-watch/current/deploy/native/neo-watch-api.service /etc/systemd/system/neo-watch-api.service
systemd-analyze verify /etc/systemd/system/neo-watch-api.service
systemctl daemon-reload
systemctl enable --now neo-watch-api
systemctl is-active neo-watch-api
curl -fsS http://127.0.0.1:4180/health
```

服务以 neo-watch 账户运行，开机启动、异常重启，除 shared/cache 外应用文件只读。若 4180 已占用，同时修改服务 PORT 与 Nginx 两处 proxy_pass，再 daemon-reload、重启本项目 API 并检查 Nginx 配置。

## 4. 配置宿主机 Nginx（首次）

模板是 http 块内的单个 server 块，不能替换全局 nginx.conf。确认 Nginx 包含 `/etc/nginx/conf.d/*.conf`，且目标文件名无冲突：

```bash
install -m 644 /opt/neo-watch/current/deploy/native/nginx.conf /etc/nginx/conf.d/neo-watch.conf
nginx -t
systemctl reload nginx
```

只有 nginx -t 成功才 reload。仅新增本项目站点，不改变已有 80/443 网站。需要直接 IP:8081 访问时，将本项目 listen 改为 `listen 8081;`，检查防火墙/安全组并重新校验、reload。8081 已占用则选择另一个空闲端口。

域名/HTTPS 由现有宿主机代理转发至 `http://127.0.0.1:8081`，或将本项目 server 块并入已有 TLS 站点。容器中的 NPM 无法通过容器自己的 loopback 访问宿主机；使用它时需先确定可达的宿主机地址和监听地址。证书沿用现有签发/续期流程，完成后用 HTTPS 域名重新验收。

## 5. 验收、更新与回退

```bash
cd /opt/neo-watch/current
node deploy/check.mjs http://127.0.0.1:8081
# 域名与证书配置完成后，再执行：
node deploy/check.mjs https://你的域名
```

检查器核对页面身份、API 健康、当天上海日期及快照字段，输出目标数、NASA 获取时间和 stale 标记。stale:true 表示当日缓存回退，仍需排查上游。随后验证桌面/手机的真实数据、详情、筛选、科普与演示切换。

更新：上传新包，在新 release 目录解包，按步骤 2 切换 current，然后执行 `systemctl restart neo-watch-api`。静态页面自动使用新链接目标；模板有变化时再审阅/更新已安装配置，不要每次覆盖本机配置。

回退：确认旧版本完整后，将 current 指回旧 release，再重启本项目 API 并重新检查。更新/回退可能短暂中断请求；shared 中的 Key 和缓存保留，不自动删除文件。

```bash
test -f /opt/neo-watch/releases/旧版本号/server/service.mjs
test -L /opt/neo-watch/current
ln -sfnT /opt/neo-watch/releases/旧版本号 /opt/neo-watch/current
systemctl restart neo-watch-api
node /opt/neo-watch/current/deploy/check.mjs http://127.0.0.1:8081
```

日志：`systemctl status neo-watch-api`、`journalctl -u neo-watch-api -n 50 --no-pager`。启动失败检查运行配置/Node 路径；API 503 检查 NASA 可用性；Nginx 502 检查 4180 监听。不要输出环境文件或带 Key 的上游 URL。

前台诊断可先停止本项目常驻 API，再在 release 目录执行（结束后恢复服务）：

```bash
HOST=127.0.0.1 PORT=4180 FEED_CACHE_FILE=/opt/neo-watch/shared/cache/today.json node --env-file=/opt/neo-watch/shared/api.env server/service.mjs
```

`npm start` 也是 API 入口，要求事先通过运行环境设置 NASA_API_KEY；它不读取开发用 .env.local，也不提供静态网页，生产页面由 Nginx 提供。
