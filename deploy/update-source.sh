#!/usr/bin/env bash
# Upgrade installations created by install-source.sh; never reset configuration.
set -Eeuo pipefail

usage() {
    echo 'Boan 源码升级：sudo bash update-source.sh'
    echo '仅支持之前通过 Boan 源码脚本安装的 Debian/Ubuntu + SQLite。'
    echo '先构建，再短暂停机备份、替换程序及菜单；失败时恢复旧程序与数据库。'
}

upgrade_healthy() {
    local first_pid second_pid
    systemctl is-active --quiet x-ui || return 1
    first_pid=$(systemctl show x-ui -p MainPID --value)
    [[ "$first_pid" =~ ^[1-9][0-9]*$ ]] || return 1
    ss -Hltnp | grep -q "pid=${first_pid}," || return 1
    sleep 3
    second_pid=$(systemctl show x-ui -p MainPID --value)
    [[ "$first_pid" == "$second_pid" ]] && systemctl is-active --quiet x-ui
}

# Restore only the files the updater changes. Retain failed data for diagnosis.
upgrade_restore_files() {
    local backup_dir="$1" install_dir="$2" data_dir="$3" menu_file="$4"
    install -m 755 "$backup_dir/x-ui" "$install_dir/x-ui" || return 1
    install -m 755 "$backup_dir/menu.sh" "$menu_file" || return 1
    cp -a "$backup_dir/source-commit" "$install_dir/source-commit" || return 1
    mv "$data_dir" "$backup_dir/failed-data" || return 1
    cp -a "$backup_dir/data" "$data_dir" || return 1
}

upgrade_source() {
    [[ $EUID -eq 0 && $(uname -s) == Linux && -d /run/systemd/system ]] || { echo '请在 systemd Linux 服务器上以 root 执行。' >&2; return 1; }
    umask 077
    exec 9>/run/lock/boan-deploy.lock
    flock -n 9 || { echo '另一个安装或升级正在运行，请等待完成。' >&2; return 1; }
    [[ -f /usr/local/x-ui/source-commit && -x /usr/local/x-ui/x-ui && -f /etc/x-ui/x-ui.db ]] || { echo '未检测到 Boan 源码安装；原版或 Docker 安装请勿使用此脚本。' >&2; return 1; }
    [[ -f /etc/default/x-ui && -f /etc/systemd/system/x-ui.service && -f /usr/bin/x-ui ]] || { echo '安装文件不完整，停止升级。' >&2; return 1; }
    local path
    for path in /usr/local/x-ui /etc/x-ui /usr/bin/x-ui /etc/default/x-ui; do
        [[ ! -L "$path" ]] || { echo "自定义符号链接路径不支持自动升级：$path" >&2; return 1; }
    done
    # shellcheck source=/dev/null
    . /etc/os-release
    case "${ID}:${VERSION_ID}" in debian:13|ubuntu:24.04|ubuntu:26.04) ;; *) echo '仅支持 Debian 13、Ubuntu 24.04 / 26.04。' >&2; return 1 ;; esac
    # shellcheck source=/dev/null
    . /etc/default/x-ui
    [[ "${XUI_DB_TYPE:-sqlite}" == sqlite || -z "${XUI_DB_TYPE:-}" ]] || { echo 'PostgreSQL 安装需要单独备份方案，已停止。' >&2; return 1; }
    [[ "${XUI_DB_FOLDER:-/etc/x-ui}" == /etc/x-ui && "${XUI_BIN_FOLDER:-/usr/local/x-ui/bin}" == /usr/local/x-ui/bin ]] || { echo '自定义数据目录需要单独升级方案，已停止。' >&2; return 1; }
    export XUI_DB_FOLDER=/etc/x-ui XUI_BIN_FOLDER=/usr/local/x-ui/bin
    local arch node_arch ref="${BOAN_REF:-main}"
    case $(uname -m) in x86_64) arch=amd64; node_arch=x64 ;; aarch64|arm64) arch=arm64; node_arch=arm64 ;; *) echo '仅支持 x86_64 / ARM64。'; return 1 ;; esac
    [[ "$ref" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ && "$ref" != *..* ]] || { echo 'BOAN_REF 无效。'; return 1; }
    umask 077
    [[ ! -L /root/boan-update.log ]] || return 1
    touch /root/boan-update.log
    chmod 600 /root/boan-update.log
    exec > >(tee -a /root/boan-update.log) 2>&1
    local work backup='' was_active=false stopped=false replacement_started=false
    work=$(mktemp -d /var/tmp/boan-update.XXXXXXXX)
    # Dynamic scope lets the error handler see the transaction state. Keep the
    # failed database for diagnosis; never discard it during a rollback.
    upgrade_failure() {
        local code=$1 restore_ok=true
        trap - ERR INT TERM
        set +e
        if [[ "$replacement_started" == true ]]; then
            systemctl stop x-ui || restore_ok=false
            if [[ "$restore_ok" == true ]]; then
                upgrade_restore_files "$backup" /usr/local/x-ui /etc/x-ui /usr/bin/x-ui || restore_ok=false
            fi
        fi
        if [[ "$stopped" == true && "$was_active" == true && "$restore_ok" == true ]]; then
            systemctl start x-ui || restore_ok=false
        fi
        echo "升级失败。备份：${backup:-尚未进入替换阶段}；日志：/root/boan-update.log" >&2
        if [[ "$restore_ok" != true ]]; then echo '自动恢复未完成，请保持服务停止并从备份恢复。' >&2; fi
        exit "$code"
    }
    trap 'upgrade_failure $?' ERR
    trap 'upgrade_failure 130' INT
    trap 'upgrade_failure 143' TERM
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl git build-essential xz-utils tar python3 iproute2 iputils-ping
    # Fetch helper from the selected ref; the helper does not execute on source.
    curl -fL --retry 5 "https://raw.githubusercontent.com/AlexGe2003/boan/${ref}/deploy/install-source.sh" -o "$work/build-helper.sh"
    # shellcheck source=/dev/null
    . "$work/build-helper.sh"
    declare -F build_source >/dev/null
    echo '正在构建新版；现有面板继续运行。'
    build_source "$work" "$arch" "$node_arch" "$ref" panel
    # No Xray/GeoIP/runtime downloads in panel mode: preserve node runtime files.
    bash -n x-ui.sh
    systemctl is-active --quiet x-ui && was_active=true
    backup=$(mktemp -d /var/backups/boan-update.XXXXXXXX)
    cp -a /usr/local/x-ui/x-ui "$backup/x-ui"
    cp -a /usr/bin/x-ui "$backup/menu.sh"
    cp -a /usr/local/x-ui/source-commit "$backup/source-commit"
    cp -a /etc/default/x-ui "$backup/environment"
    cp -a /etc/systemd/system/x-ui.service "$backup/service"
    echo "构建完成，备份到 $backup；现在短暂停止面板及节点服务。"
    stopped=true
    systemctl stop x-ui
    # Copy SQLite, WAL, keys and ancillary files only after the writer is stopped.
    cp -a /etc/x-ui "$backup/data"
    replacement_started=true
    install -m 755 build/x-ui /usr/local/x-ui/x-ui.next
    mv /usr/local/x-ui/x-ui.next /usr/local/x-ui/x-ui
    install -m 755 x-ui.sh /usr/bin/x-ui.next
    mv /usr/bin/x-ui.next /usr/bin/x-ui
    printf '%s\n' "$built_commit" > /usr/local/x-ui/source-commit
    if [[ "$was_active" == true ]]; then
        systemctl start x-ui
        local ready=false
        for attempt in {1..20}; do
            if upgrade_healthy; then ready=true; break; fi
            sleep 1
        done
        [[ "$ready" == true ]]
    fi
    trap - ERR INT TERM
    cd /root
    rm -rf -- "$work"
    echo "升级完成，提交：$built_commit"
    echo "原配置、账号、证书及节点运行时已保留。备份目录：$backup"
    if [[ "$was_active" != true ]]; then echo '升级前服务已停止，目前仍保持停止。'; fi
    echo '运行 x-ui 查看新版中文分类菜单。'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    case "${1:-}" in -h|--help) usage ;; '') upgrade_source ;; *) usage; exit 2 ;; esac
fi
