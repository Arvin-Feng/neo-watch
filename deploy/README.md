# NEO Watch：neo.innovelyx.com 部署步骤

适用环境：Debian 12，现有 Docker / Compose，Nginx Proxy Manager 容器 `npm-app-1`，外部网络 `techainetwork`。这些信息已通过只读检查确认。现有代理继续负责 80/443 和证书；项目不发布新的宿主机端口。

## 1. 在电脑上构建部署包

```bash
cd "/Users/yu/Developer/MyIdea/04-AI星球/NEO Watch"
bash deploy/package.sh
```

脚本运行测试，向新的独立目录构建，并检查网页中没有本地 NASA Key 或直接请求 NASA 的代码。末尾输出压缩包路径和 UTC 版本号。压缩包不包含 `.env.local`、`node_modules` 或密码。

下文的 `版本号` 必须替换为脚本输出的实际版本号。

## 2. 上传文件（电脑终端）

```bash
scp "deployment-artifacts/版本号/neo-watch-版本号.tar.gz" root@89.28.239.95:/tmp/
ssh root@89.28.239.95
```

SSH 密码在提示时输入，不写入命令或文件。首次连接应核对服务器指纹。

## 3. 准备目录和 NASA Key（服务器终端）

```bash
mkdir -p /opt/neo-watch/releases /opt/neo-watch/shared/cache
chown 1000:1000 /opt/neo-watch/shared/cache
chmod 700 /opt/neo-watch/shared/cache
```

首次部署设置 Key。后续升级已有 Key 时跳过本段：

```bash
umask 077
read -r -s -p 'NASA API Key: ' neo_watch_key
printf '\n'
printf 'NASA_API_KEY=%s\n' "$neo_watch_key" > /opt/neo-watch/shared/api.env
unset neo_watch_key
chmod 600 /opt/neo-watch/shared/api.env
```

输入自己的 NASA Key，不使用 DEMO_KEY。以上输入不会写入 shell 历史；不要把 Key 或 `api.env` 内容贴到聊天中。

## 4. 解包与启动（服务器终端）

将第一行中的版本号替换为实际值：

```bash
neo_watch_release=版本号
mkdir "/opt/neo-watch/releases/$neo_watch_release"
tar -xzf "/tmp/neo-watch-$neo_watch_release.tar.gz" -C "/opt/neo-watch/releases/$neo_watch_release"
cd "/opt/neo-watch/releases/$neo_watch_release"
docker network inspect techainetwork --format '{{.Name}}'
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml pull
docker compose -f deploy/compose.yaml up -d --wait
docker compose -f deploy/compose.yaml ps
```

两个项目容器都应为 healthy。本步骤仅操作 `neo-watch` Compose 项目；不执行全局 Docker 清理，不停止其他项目。原有容器不会被修改。若同一版本目录已存在，应检查已有内容后使用新的版本号，不覆盖或删除目录。

验证数据获取：

```bash
docker compose -f deploy/compose.yaml exec -T api node --input-type=module -e "const r=await fetch('http://127.0.0.1:8080/api/neo/today');const d=await r.json();console.log({status:r.status,date:d.date,targets:d.items?.length,fetchedAt:d.fetchedAt,stale:d.stale});if(!r.ok)process.exit(1)"
docker exec npm-app-1 curl -fsS http://neo-watch-web:8080/health
```

第一条应返回 status 200、当天上海日期、目标数量和实际 NASA 获取时间；第二条应返回 `{"status":"ok"}`。

## 5. 配置现有 Nginx Proxy Manager

登录你现有的 Nginx Proxy Manager 管理页。进入 Hosts → Proxy Hosts → Add Proxy Host：

| 字段 | 值 |
|---|---|
| Domain Names | `neo.innovelyx.com` |
| Scheme | `http` |
| Forward Hostname / IP | `neo-watch-web` |
| Forward Port | `8080` |
| Access List | Publicly Accessible |

保存后先检查 `http://neo.innovelyx.com`。容器域名转发依赖项目与 NPM 同属 `techainetwork`；这符合现有服务器网络结构。

## 6. 配置 HTTPS

编辑刚创建的代理项，在 SSL 标签选择 Request a new SSL Certificate。按照当前面板提示填写信息并由你接受证书服务条款；签发成功后启用 Force SSL、HTTP/2 Support。

当前 DNS 查询直接返回服务器 IP，可保留此 DNS 状态完成证书验证。若之后开启 Cloudflare 代理，先确认源站 HTTPS 正常，再使用 Full (strict)；不要为本项目修改其他网站的配置。

## 7. 验收

电脑终端执行：

```bash
curl -I https://neo.innovelyx.com/
curl -fsS https://neo.innovelyx.com/api/neo/today
```

浏览器检查：地球纹理、当天目标、目标详情、潜在危险筛选、手机列表、演示与返回真实数据。数据时间是 NASA 成功获取时间，不是浏览器刷新时间。缓存默认有效十分钟；NASA 失败时仅回退到当天数据并显示“服务器缓存”，失败后有三十秒重试间隔。

健康检查只验证进程可用，不能替代上述 NASA 数据接口验收。完成后记下当前版本号。

## 8. 后续更新及回退

更新时使用新的部署包、新的 releases 目录，保留 shared 下的 Key 与缓存，重复步骤 4。Compose 项目名固定为 neo-watch，会替换本项目两个容器；更新期间可能有短暂请求中断。

需要回退时进入已验证的旧版本目录执行：

```bash
cd /opt/neo-watch/releases/旧版本号
docker compose -f deploy/compose.yaml up -d --force-recreate --wait
```

版本目录、上传压缩包和测试临时文件均保留；本流程没有批量删除或自动清理操作。

## 验证范围

本地单元测试覆盖并发请求合并、十分钟缓存、获取时间、失败回退及重试退避、上海跨日、固定接口、持久化恢复和浏览器数据验证。上线前仍需在目标服务器验证 Docker 镜像、Nginx 配置、容器健康和证书流程；不能把本地构建成功视为公网已上线。
