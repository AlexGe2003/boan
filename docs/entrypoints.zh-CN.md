# 独立域名、用户网站开关与 SSL

升级到包含此功能的二进制和 `x-ui.sh` 后，运行 `x-ui entry`，或在主菜单选择 **29. Domains, website access & SSL**。这是服务器上的交互菜单。容器内可使用 `/app/x-ui entry` 的参数命令；二进制命令不带参数时显示配置。

## 配置顺序

1. 为管理员、用户网站、订阅、节点准备各自的域名，并完成 DNS 解析。
2. 执行 `/usr/local/x-ui/x-ui entry -show` 查看 `basePath`。管理员和用户 URL 必须包含同一个现有基础路径；两个入口使用不同域名，不通过不同路径区分。
3. 在菜单 1 设置管理员和用户 URL，在菜单 2 设置订阅入口。在菜单 3 按入站 ID 设置节点连接域名。
4. 在菜单 5 分别设置证书，或菜单 6 为域名申请证书。两个网站证书全部配置完毕后，菜单 8 校验并重启。
5. 分别测试管理员和用户入口，再通过菜单 4 关闭用户网站。

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

菜单 6 使用现有 acme.sh 工具，通过 HTTP-01 为单个域名申请证书，要求 DNS 已解析、外部 80 端口可达且本机端口可用，并已安装 socat。acme.sh 的续期任务安装并保留后，续期将更新证书文件并在配置检查通过时重启服务。通配符证书可通过原有 Cloudflare DNS 证书菜单申请，再在菜单 5 绑定文件。公共 CA 实际签发与续期需在部署服务器上验证。

## 恢复访问

误填域名时，在服务器 SSH 中执行：

```bash
/usr/local/x-ui/x-ui entry -reset
x-ui restart
```

这会移除独立入口策略和对应网站证书路径，恢复旧的共用登录方式，保留订阅和节点设置。旧的 `webDomain`、基础路径、面板 TLS 设置仍然有效；如果它们也不正确，需要通过原有设置命令修正。
