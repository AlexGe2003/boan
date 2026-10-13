# Cloud deployment (unattended install)

## Boan GitHub CI/CD 与 HK

HK 使用 Debian 13 / amd64、systemd `x-ui` 和 `/usr/local/x-ui` 源码安装布局。
`.github/workflows/hk.yml` 在 GitHub 的 Ubuntu 24.04 runner 上编译，HK 仅接收安装包，无需安装 Node 或 Go。

- PR 和 main 提交运行 CI；Release、Docker、HK 工作流复用同一套 CI，检查失败不发布。
- Docker 镜像发布到当前仓库对应的 GHCR 地址（本仓库为 `ghcr.io/alexge2003/boan`），支持 amd64 和 arm64，无需 Docker Hub 凭据。
- 在 Actions → **Boan HK** → **Run workflow** 选择 main。默认 `deploy=false`，只测试、构建并保存 14 天的安装包。部署其他分支会被跳过。
- `deploy=true` 才执行 HK 更新，部署任务串行运行。更新会短暂停止 x-ui 及其节点服务；程序、菜单、提交标记和 SQLite 数据会备份，启动检查失败时恢复旧版本及数据库。Xray、证书与节点运行时不随安装包替换。
- 当前健康检查验证进程持续运行和监听端口；不代替公网代理链路的业务测试。

首次启用需在 GitHub 仓库创建 `hk-production` Environment，并限制部署分支为 main：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Variable | `HK_HOST` | HK 的 SSH IPv4 或主机名 |
| Variable | `HK_PORT` | SSH 端口，默认 22 |
| Secret | `HK_SSH_KEY` | 专用于部署的无口令 SSH 私钥，对应公钥需安装到 HK root 的 authorized_keys |
| Secret | `HK_KNOWN_HOSTS` | 已核实的 SSH 主机公钥记录，非默认端口使用 `[host]:port` 格式 |

不要把本机服务器密码文件或业务环境文件提交到仓库。工作流使用严格 SSH 主机校验；部署私钥只提供给 Environment 下的部署任务。
GitHub 凭据配置和首次线上更新需要另行完成，新增文件本身不会更新 HK。

安装包包含 `x-ui`、`x-ui.sh`、`source-commit`、`SHA256SUMS` 和升级脚本。
升级脚本要求包内提交与工作流提交一致、三个载荷文件的校验和完整匹配，再进入停机阶段。
备份位于 `/var/backups/boan-update.*`，日志位于 `/root/boan-update.log`。

本地验证 CI/CD 改动：

```sh
go test deploy_source_test.go -v
bash -n deploy/update-source.sh
actionlint .github/workflows/ci.yml .github/workflows/docker.yml .github/workflows/release.yml .github/workflows/hk.yml
```

Tooling to ship the 3x-ui panel via unattended install, with **per-instance
credentials generated on first boot** (never `admin/admin`, never a shared
session secret). Works on amd64 and arm64.

| Path | What it is | Use when |
| --- | --- | --- |
| [`cloud-init/`](cloud-init/) | Generic cloud-init user-data (unattended `install.sh`) | Any cloud, no image build |
| [`marketplace/hetzner/`](marketplace/hetzner/) | Hetzner Cloud notes | Hetzner deployments |
| [`test/`](test/) | Container smoke test | Verifying the install path |

## How it works

`install.sh` runs unattended when `XUI_NONINTERACTIVE=1` or stdin is not a TTY.
Each instance installs and configures itself with random credentials. See
[`cloud-init/README.md`](cloud-init/README.md).

## Unattended install knobs

`install.sh` reads these env vars in non-interactive mode (all optional; unset ⇒
secure random / default):

`XUI_USERNAME`, `XUI_PASSWORD`, `XUI_PANEL_PORT`, `XUI_WEB_BASE_PATH`,
`XUI_SSL_MODE` (`none`|`ip`|`domain`, default `none`), `XUI_DOMAIN`,
`XUI_ACME_EMAIL`, `XUI_ACME_HTTP_PORT` (ACME HTTP-01 listener port, default `80`),
`XUI_SSL_IPV6` (optional IPv6 address to add to an `ip`-mode cert),
`XUI_SERVER_IP` (fallback IP for the displayed access URL when auto-detection fails),
`XUI_DB_TYPE` (`sqlite`|`postgres`), `XUI_DB_DSN`.

The resulting credentials are written to `/etc/x-ui/install-result.env` (mode 600).
