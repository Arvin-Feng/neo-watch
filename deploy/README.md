# NEO Watch 部署指南

项目支持 Docker 和非 Docker 两种生产部署方式，复用同一份版本部署包、服务端 NASA API 和当日缓存规则。

| 方式 | 运行主机依赖 | 入口与说明 |
|---|---|---|
| 独立 Docker | Docker Engine + Compose | [独立 Compose 指南](docker-standalone.md)，默认 127.0.0.1:8081，可改为 IP:端口 |
| Docker + 现有 NPM | Docker Engine + Compose + 已有 NPM 网络 | [NPM 指南](docker-npm.md)，保留原 techainetwork 方案 |
| 非 Docker | Node.js 22.12+ + systemd + Nginx | [宿主机部署指南](native/README.md)，API 127.0.0.1:4180、网页 127.0.0.1:8081 |

Docker 两个配置文件二选一；非 Docker 是另一种运行方式。默认项目名和缓存路径共用，切换前停止本项目旧服务，并按目标方式调整缓存目录所有权，避免两套进程同时写缓存。

## 构建与上传（所有方式共用）

构建机需要 Node.js 22.12+ 和 npm。在项目根目录、依赖已安装后执行：

```bash
bash deploy/package.sh
```

首次从 GitHub 全新克隆时先安装依赖。打包脚本执行全量测试，构建到新的 UTC 时间戳目录，检查生产前端不包含本地 NASA Key 或直连 NASA feed 代码，再输出归档路径。它不清空旧 dist、不删除旧版本。

包内包含 dist、server、API 依赖的 src 模块、package.json 和完整 deploy 目录（含两类配置、配置样例、检查器与说明）；不包含真实环境配置、node_modules 或聊天记录。运行主机不需要 npm install；Docker 使用 Node 镜像，非 Docker 使用系统 Node。

将实际版本号、服务器地址、用户名和上传目录代入：

```bash
scp "deployment-artifacts/版本号/neo-watch-版本号.tar.gz" 用户名@服务器地址:/tmp/
```

密钥通过服务器上的 `/opt/neo-watch/shared/api.env` 配置，仅设置 NASA_API_KEY；不要把开发用 VITE_NASA_API_KEY 前缀嵌入值。样例见 [api.env.example](api.env.example)。首次创建配置后设置 root 所有、600 权限；升级保留原配置。需要改路径时按照对应指南同时修改服务配置。

## 验收与维护

非 Docker 在 release 目录运行：

```bash
node deploy/check.mjs http://127.0.0.1:8081
# 域名与 HTTPS 配置后：
node deploy/check.mjs https://你的域名
```

Docker 内部检查命令见各自指南。检查器验证首页身份、health、当天上海日期、快照格式，输出目标数、NASA 获取时间和 stale。stale:true 表示上游失败时的当日缓存，需继续排查；健康检查不能代替真实接口检查。随后检查桌面/手机的选择、筛选、科普、演示与返回真实数据。

两种方式都只由服务端请求 NASA，TTL 十分钟、失败退避三十秒、原获取时间保留、跨日不复用旧数据。域名与证书由选定入口处理，不能用默认站点 200 宣称上线。更新/回退使用新的 release 目录和共享配置，可能短暂中断，不自动清理文件。

配置参考：[Docker Compose](https://docs.docker.com/reference/compose-file/services/)、[Nginx proxy 模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[systemd 服务配置](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)。
