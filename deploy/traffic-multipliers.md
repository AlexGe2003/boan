# 套餐流量倍率

`XUI_LOCAL_TRAFFIC_MULTIPLIER` 控制本机 Xray 新产生流量的套餐扣量。默认 `1.0`，支持 `0.001` 至 `100`，最多三位小数。非法配置会阻止启动。

当前部署：US03、US04 为 `0.1`，其他服务器为 `1.0`。服务器额度统计的 `server_usage_billings` 是另外一种计费口径，不用于此设置。

在节点创建 `/etc/systemd/system/x-ui.service.d/traffic-multiplier.conf`：

```ini
[Service]
Environment="XUI_LOCAL_TRAFFIC_MULTIPLIER=0.1"
```

执行 `systemctl daemon-reload` 和 `systemctl restart x-ui`。检查进程环境确认生效；EnvironmentFile 中的同名值可能覆盖此设置。

- 只折算本机 Xray 的新流量；已入账历史不变。
- 节点上传的 `up/down` 已折算，主面板不再乘倍率。主面板和优惠节点都需要此版本。
- 每个方向保存不足一字节的余数，避免高频采样丢掉小流量。余数跨重启保留，跨套餐重置最多结转不足一字节。
- `rawUp/rawDown` 独立累计升级后的实际流量，套餐重置不清零。主面板使用独立原始流量基线维护服务器实际用量；旧节点继续使用原来的统计方式。
- 透明中转在落地节点扣量；目前 US05 落地保持 `1.0`。
- 修改实际倍率后同步订阅 host 名称中的倍率标注。升级时保留 systemd drop-in。

测试覆盖 10 GiB 按 0.1 倍扣 1 GiB、默认 1 倍、历史不变、小流量余数、额度重置、混合节点汇总和整数溢出。
