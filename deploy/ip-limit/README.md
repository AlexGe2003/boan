# Online source-IP limits

This configures the fail2ban enforcement used by the panel's existing online-IP job. It does not change subscription credentials, account limits, or plan quotas.

On each SQLite panel/node running Xray TCP inbounds:

```sh
apt-get update
apt-get install -y fail2ban iptables
python3 deploy/ip-limit/configure.py
```

Set the customer's IP limit to `3` through the panel, and set the same default on subscription plans. Customer updates dispatch through the node runtime; verify that the master can fetch and push `/panel/api/server/clientIps` on every enabled node. Rerun configuration after changing local proxy ports. The script backs up fail2ban configuration before updating it.

The job preserves admitted online sources and rejects excess sources. Checks run approximately every 10 seconds; node synchronization adds delay. IPv4 and IPv6 use a 60-second TCP-reset ban on local proxy ports. Offline sources stop counting after approximately two minutes.

This counts public source IPs, not physical devices. Several devices behind one NAT can share a slot, and IPv4/IPv6 can use separate slots. Banning a source affects other accounts using that source on the same node's proxy ports. SSH and panel access are outside the proxy-port action. The configuration supports Xray TCP inbounds; it is not a limiter for separate UDP sidecars.

Clash/Mihomo clients should use the Clash subscription URL; Shadowrocket and v2rayN/v2rayNG use the ordinary subscription URL. The IP policy does not require hardware identifiers or special client software.
