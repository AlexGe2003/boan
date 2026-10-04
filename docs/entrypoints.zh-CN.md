# 独立域名、用户网站开关与 SSL

升级到包含此功能的二进制和 `x-ui.sh` 后，运行 `x-ui`，在 **域名与节点 / 网站访问控制 / SSL 证书** 分类中操作。`x-ui entry` 保留为网站配置快捷入口。这是服务器上的交互菜单。容器内可使用 `/app/x-ui entry` 的参数命令；二进制命令不带参数时显示配置。

## 配置顺序

1. 为管理员、用户网站、订阅、节点准备各自的域名，并完成 DNS 解析。
2. 执行 `/usr/local/x-ui/x-ui entry -show` 查看 `basePath`。管理员和用户 URL 必须包含同一个现有基础路径；两个入口使用不同域名，不通过不同路径区分。
3. 在「域名与节点」中设置管理员、用户和订阅入口，并按入站 ID 设置节点地址。
4. 在「SSL 证书」中分别配置或申请证书。两个网站证书配置完毕后，执行「检查证书并选择是否重启」。
5. 分别测试管理员和用户入口，再通过「网站访问控制 → 开放 / 关闭用户网站」调整开关。

URL 配置不会创建 DNS 记录、开放防火墙或修改监听端口。管理员和用户网站共享现有面板监听端口；订阅使用现有独立订阅端口。直连时 URL 写上实际端口。若希望所有地址使用 HTTPS 默认的 443 端口，通过反向代理按域名转发：管理员和用户域名转发到面板端口，订阅域名转发到订阅端口。代理必须保留原始 `Host`；应用不会信任 `X-Forwarded-Host` 来决定入口权限。

例如，面板基础路径为 `/control/`，监听 2053，订阅监听 2096：

```bash
/usr/local/x-ui/x-ui entry \
  -admin-url https://admin.example.com:2053/control/ \
  -user-url https://user.example.com:2053/control/

/usr/local/x-ui/x-ui entry -subscription-url https://sub.example.com:2096
/usr/local/x-ui/x-ui entry -inbound-id 1 -node-address node.example.com
```

订阅设置保留原有普通、JSON、Clash 路径及用户订阅标识，并更新三种格式的公开 URL。订阅功能仍需在原有设置中启用。已分发的旧 URL 不会自动更新，请在迁移期保留旧入口或重新分发新链接。

节点地址是客户端连接的主机名或 IP，不含 `https://`、路径或端口。已有单一独立 Host 会更新地址，同时保留端口、SNI 和传输设置；多地址或跨入站共享 Host 请在后台的 Hosts 页面选择修改。此命令不会更改 Xray 入站的 TLS/Reality 配置，节点协议证书继续在入站设置中管理。

## 用户网站开关

```bash
/usr/local/x-ui/x-ui entry -user-enabled false
/usr/local/x-ui/x-ui entry -user-enabled true
```

开关对后续 HTTP 请求立即生效，无需重启。关闭后，用户域名的页面、静态资源、登录和 API 返回 404，已登录用户也不能继续请求。已有 WebSocket 在下一次发送前拒绝数据，并在最迟约 5 秒后断开。浏览器已下载的内容无法撤回。

管理员登录和管理 API 仅允许管理员域名，普通账号不能从管理员入口绕过限制。关闭用户网站不修改订阅服务或节点连接。未配置独立入口时保留原有登录行为，并拒绝关闭共用网站，以免封掉管理员入口。

节点管理 API / 集群同步的调用方应改用管理员域名；这里的“节点地址”指客户端连接代理服务的地址，不是管理 API 地址。

## SSL 证书

```bash
/usr/local/x-ui/x-ui entry -target admin \
  -cert /root/cert/admin.example.com/fullchain.pem \
  -key /root/cert/admin.example.com/privkey.pem

/usr/local/x-ui/x-ui entry -target user \
  -cert /root/cert/user.example.com/fullchain.pem \
  -key /root/cert/user.example.com/privkey.pem

/usr/local/x-ui/x-ui entry -target subscription \
  -cert /root/cert/sub.example.com/fullchain.pem \
  -key /root/cert/sub.example.com/privkey.pem

/usr/local/x-ui/x-ui entry -check
x-ui restart
```

保存证书时校验密钥配对、域名覆盖和有效期。面板按 TLS SNI 选择管理员或用户证书。`-target both` 可绑定一份同时覆盖两个域名的证书；也可以使用原有面板证书作为缺省证书，但必须覆盖两个域名。直连 TLS 的两个网站证书必须齐备，否则检查和启动会失败，不会自动退回明文 HTTP。

如果 HTTPS 在反向代理终止，证书在代理中管理，后端可保留 HTTP。公开 URL 与实际代理配置必须一致。

「SSL 证书 → 申请证书与自动续期」使用现有 acme.sh 工具，通过 HTTP-01 为单个域名申请证书，要求 DNS 已解析、外部 80 端口可达且本机端口可用，并已安装 socat。acme.sh 的续期任务安装并保留后，续期将更新证书文件并在配置检查通过时重启服务。通配符证书可通过原有 Cloudflare DNS 证书菜单申请，再在「配置证书与私钥」中绑定文件。公共 CA 实际签发与续期需在部署服务器上验证。

## 恢复访问

误填域名时，在服务器 SSH 中执行：

```bash
/usr/local/x-ui/x-ui entry -reset
x-ui restart
```

这会移除独立入口策略和对应网站证书路径，恢复旧的共用登录方式，保留订阅和节点设置。旧的 `webDomain`、基础路径、面板 TLS 设置仍然有效；如果它们也不正确，需要通过原有设置命令修正。

## 屏蔽中国大陆、香港、澳门和台湾的网站访问

在 `x-ui → 网站访问控制 → 地区屏蔽开关` 中输入 `y` 开启、`n` 关闭，回车保留当前值。对应服务器命令：

```bash
# 开启：立即限制管理员和用户网站，无需重启
/usr/local/x-ui/x-ui entry -block-domestic true

# 查看当前开关、地区和可信代理配置
/usr/local/x-ui/x-ui entry -show

# 恢复访问：即使地区数据库丢失，也可以通过 SSH 关闭
/usr/local/x-ui/x-ui entry -block-domestic false
```

开启后，本机 `geoip.dat` 中归属 CN、HK、MO、TW 的来源 IP 访问管理员和用户网站会收到 403；限制覆盖登录、页面、静态资源、API 和 WebSocket。已有 WebSocket 在发送新数据前重新检查，最迟约 5 秒断开。订阅 URL 和节点连接不受此开关影响。原有后台的地区屏蔽开关与此命令使用同一设置。

启用前会检查 `geoip.dat` 是否存在且包含所需地区，缺失时拒绝启用。启用后数据库损坏或丢失，网站返回 503，直到修复数据库或通过 SSH 关闭限制；不会悄悄放行。通过原有菜单更新 GeoIP 数据后，后续请求自动加载更新。

如果前面有 Nginx 等反向代理，在「网站访问控制 → 可信反向代理」中配置实际代理的 IP/CIDR，例如：

```bash
/usr/local/x-ui/x-ui entry -trusted-proxies '127.0.0.1/32,::1/128'
```

只信任实际代理，不要把所有访问者地址加入信任列表。代理必须正确追加或重写 `X-Forwarded-For`，不能原样透传客户端伪造值。可信代理未提供可验证的访客 IP 时拒绝访问；非可信来源发送的转发头不会改变判定结果。CDN 场景需填写实际 CDN 出口网段，并限制来源服务器只能被预期代理访问。

这按连接来源 IP 的地区判断，不识别人的实际所在地；使用境外 VPN 或代理出口的访客可能不被屏蔽。管理员从上述地区直连时也会被限制，可以通过 SSH 执行关闭命令恢复；`entry -reset` 只恢复登录入口，不会关闭地区限制。

## 分类菜单和默认值

`x-ui` 主菜单分为：当前配置概览、域名与节点、网站访问控制、SSL 证书、服务管理、账户与面板、网络与数据库、安装与更新。

交互开关只需输入 `y/n`（支持大写）。回车采用提示中显示的当前值；新安装默认开放用户网站、关闭地区屏蔽。地址和证书路径回车保留现值，尚未设置时留空取消该次修改，不使用虚构域名。可信代理默认保留现值，输入 `-` 才会清空。恢复共用入口和证书检查后的重启确认默认 `n`；菜单选择默认 `0` 返回。

程序化 CLI 的 `true/false` 参数仍然兼容。新菜单的当前值读取和中文概览需要新版二进制，部署时请同时更新程序及菜单；不要仅用新脚本覆盖旧程序。
