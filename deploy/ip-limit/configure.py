#!/usr/bin/env python3
"""Configure the online source-IP limiter for a local SQLite panel."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time


def run(*args):
    subprocess.run(args, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='/etc/x-ui/x-ui.db')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run as root to configure fail2ban.')
    for command in ('fail2ban-client', 'iptables', 'ip6tables'):
        if shutil.which(command) is None:
            parser.error(f'Missing {command}; install fail2ban and iptables first.')
    os.umask(0o077)
    with sqlite3.connect(f'file:{Path(args.db).resolve()}?mode=ro', uri=True) as db:
        ports = sorted({port for port, protocol in db.execute(
            'SELECT port, protocol FROM inbounds WHERE enable=1 AND node_id IS NULL'
        ) if protocol in ('vless', 'vmess', 'trojan', 'shadowsocks')})
    if not ports or len(ports) > 15 or any(not 1 <= port <= 65535 for port in ports):
        parser.error('Expected 1–15 enabled local Xray TCP ports.')
    folder = Path('/etc/fail2ban')
    backup = Path('/root') / time.strftime('boan-ip-limit-config-%Y%m%d-%H%M%S', time.gmtime())
    shutil.copytree(folder, backup)
    log = Path('/var/log/x-ui/3xipl.log')
    log.parent.mkdir(parents=True, exist_ok=True)
    log.touch(exist_ok=True)
    try:
        (folder / 'filter.d/boan-iplimit.conf').write_text(
            '[Definition]\ndatepattern = ^%%Y/%%m/%%d %%H:%%M:%%S\n'
            r'failregex = \[LIMIT_IP\]\s*Email\s*=\s*<F-USER>.+</F-USER>\s*\|\|\s*Disconnecting OLD IP\s*=\s*<ADDR>\s*\|\|\s*Timestamp\s*=\s*\d+'
            '\nignoreregex =\n'
        )
        (folder / 'action.d/boan-iplimit-reset.conf').write_text(
            '[INCLUDES]\nbefore = iptables-multiport.conf\n[Definition]\n'
            'actionban = <iptables> -I f2b-<name> 1 -p tcp -s <ip> -j REJECT --reject-with tcp-reset\n'
            'actionunban = <iptables> -D f2b-<name> -p tcp -s <ip> -j REJECT --reject-with tcp-reset\n'
        )
        (folder / 'jail.d/3x-ipl.conf').write_text(
            '[3x-ipl]\nenabled = true\nbackend = polling\nfilter = boan-iplimit\n'
            'logpath = /var/log/x-ui/3xipl.log\nmaxretry = 1\nfindtime = 32\nbantime = 60\n'
            'action = boan-iplimit-reset[name=boan-ipl, port="'
            + ','.join(map(str, ports)) + '", protocol=tcp]\n'
        )
        run('fail2ban-client', '-t')
        run('systemctl', 'enable', '--now', 'fail2ban')
        run('fail2ban-client', 'reload', '--restart', '3x-ipl')
        run('fail2ban-client', 'status', '3x-ipl')
    except BaseException:
        shutil.copytree(backup, folder, dirs_exist_ok=True)
        # Remove files created by this attempt that were absent from the backup.
        for relative in ('filter.d/boan-iplimit.conf', 'action.d/boan-iplimit-reset.conf', 'jail.d/3x-ipl.conf'):
            if not (backup / relative).exists():
                (folder / relative).unlink(missing_ok=True)
        subprocess.run(['fail2ban-client', 'reload', '--restart', '3x-ipl'], check=False)
        raise
    print(json.dumps({'proxyPorts': ports, 'bantimeSeconds': 60, 'backup': str(backup)}))


if __name__ == '__main__':
    main()
