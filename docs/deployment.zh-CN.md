# Boan 定制版部署

适用新安装：Debian 13、Ubuntu 24.04 / 26.04，x86_64 或 ARM64，systemd 服务管理。服务器需要能访问 GitHub、Go、Node.js 和 npm 下载服务。源码构建建议至少 4 GB 内存，并预留约 10 GB 磁盘空间；实际需求取决于构建缓存及项目版本。

## 安装

以 root 登录服务器（或先执行 `sudo -i`）：

```bash
apt-get update && apt-get install -y curl ca-certificates
curl -fL https://raw.githubusercontent.com/AlexGe2003/boan/main/deploy/install-source.sh -o /tmp/boan-install.sh
bash /tmp/boan-install.sh
```

这会安装构建依赖，下载并校验 Go/Node 工具链，构建此仓库的前后端，下载项目所需的 Xray/协议运行时及地区库，并安装 `x-ui` systemd 服务。源码提交记录在 `/usr/local/x-ui/source-commit`。它不依赖定制版 GitHub Release。

脚本拒绝覆盖现有 x-ui 程序、数据库、服务文件和凭据文件。已有服务器请先备份并单独制定升级方案，不要删除旧目录强行通过检查。需要其他面板端口时：`BOAN_PORT=8443 bash /tmp/boan-install.sh`。

日志：`/root/boan-install.log`。构建失败发生在临时目录内；安装阶段失败时保留诊断信息，不自动删除数据库。当前脚本尚未在真实 Debian/Ubuntu 服务器上完成端到端安装验证。

## 第一次登录

默认只监听 `127.0.0.1:2053`，不会把初始 HTTP 登录暴露在公网。查看安装生成的地址、用户名和密码：

```bash
cat /root/boan-login.txt
```

在你自己的电脑终端保持这个 SSH 连接运行，把 `服务器IP` 替换成真实地址：

```bash
ssh -L 2053:127.0.0.1:2053 root@服务器IP
```

然后在自己电脑的浏览器打开凭据文件中的 `Local URL`。它包含随机基础路径，不是直接打开根目录。若修改过安装端口，隧道两端端口同步修改。管理员密码和路径是随机生成的，请保存好。

## 域名、SSL 和公网访问

运行 `x-ui entry` 配置管理员和用户域名、订阅地址，以及证书。详见[独立入口配置说明](entrypoints.zh-CN.md)。

管理员和用户 URL 必须带上凭据文件中的基础路径，直连情况下也要带上面板端口。DNS 解析、云防火墙和操作系统防火墙需要与配置对应；安装脚本不会自动修改它们。

如果选择由程序直接提供 HTTPS，在两个网站证书配置完毕并检查通过后再开放监听：

```bash
/usr/local/x-ui/x-ui entry -check
/usr/local/x-ui/x-ui setting -listenIP 0.0.0.0
systemctl restart x-ui
```

`entry -check` 输出“没有证书”意味着还没有完成直连 HTTPS 配置，不能仅凭退出成功判断 HTTPS 已启用。若 HTTPS 由 Nginx 等反向代理提供，保留本机监听，代理向本地端口转发并保留原始 Host。

如需屏蔽中国大陆、香港、澳门和台湾的网站访问，在确认管理入口可用后执行：

```bash
/usr/local/x-ui/x-ui entry -block-domestic true
```

这也限制管理员网站；订阅和节点连接不受影响。SSH 恢复命令为 `entry -block-domestic false`。代理场景需要正确设置可信代理和 X-Forwarded-For。

## 状态与更新

```bash
systemctl status x-ui --no-pager
journalctl -u x-ui -n 80 --no-pager
x-ui entry
```

安装和面板更新来源已指向 `AlexGe2003/boan`。目前该仓库没有预编译 Release，所以常规“更新”菜单暂不能完成升级；不要改回原版下载源，否则会失去定制功能。这个源码安装脚本只负责首次安装，不能重复执行来升级。
