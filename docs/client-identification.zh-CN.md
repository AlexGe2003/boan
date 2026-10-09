# 订阅客户端识别与连接来源

设备页的“最近订阅客户端”来自成功获取订阅的 HTTP User-Agent，不代表当前代理连接所使用的软件。软件名和版本只在标识匹配时展示；通用 Clash/Mihomo 标识不推断具体图形客户端，未知标识显示“未识别客户端”。原始标识可用于排查，但它由客户端提供，可能被自定义。

有 HWID 的请求保留绑定设备及其请求标识；没有 HWID 的成功下载只更新账号信息，不创建绑定设备。账号级元数据在 client_subscription_fetches 中每个账号最多一行，包含最新时间、请求标识和来源 IP。删除账号时一并删除；重置订阅地址保留账号级记录。HEAD、HTML 信息页、信息查询和拒绝的请求不更新账号记录。

来源 IP 仅接受 trustedProxyCIDRs 中代理提供的地址；直接请求忽略转发头。X-Real-IP 优先，否则从 X-Forwarded-For 右侧选择第一个不受信的来源。无有效转发信息时使用直接连接地址。向用户和管理员返回的 IP 均脱敏。节点在线来源仍来自 Xray 按用户账号统计的实际连接，与这些订阅请求记录分别展示。

# Reality 配置

分享链接、JSON 和 Clash 配置导出统一使用已配置的 Reality TLS 指纹。缺失、空白或不适用于 Reality 的 unsafe 值会使用 chrome，保留其他明确配置的指纹。此项不会改写客户端 HTTP User-Agent。

官方 Reality 说明要求合适的目标站点支持 TLS 1.3 与 HTTP/2，客户端 SNI 对应服务端允许列表。运行检查可验证未经认证的连接回落、目标证书与协议协商；不能证明特定网络一定不会封锁，也不能由海外测试推断中国大陆链路结果。

参考：[REALITY 官方说明](https://github.com/XTLS/REALITY)、[TLS 指纹文档](https://xtls.github.io/config/transports/tls.html)、[Clash Verge 订阅请求说明](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/PRIVACY.md)。
