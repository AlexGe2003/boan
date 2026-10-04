#!/usr/bin/env bash
# First installation only. Builds this fork without relying on GitHub Releases.
set -Eeuo pipefail

usage() {
    cat <<'HELP'
Boan source installer for a NEW Debian 13 / Ubuntu 24.04 or 26.04 server.
Run as root: bash install-source.sh
Optional: BOAN_REF=main (branch or tag), BOAN_PORT=2053
Builds from https://github.com/AlexGe2003/boan and installs x-ui + systemd.
Existing x-ui installations are refused. Initial website binds to 127.0.0.1.
HELP
}

fetch() {
    curl --fail --location --retry 5 --retry-delay 3 --connect-timeout 20 "$@"
}

install_source() {
    [[ ${EUID} -eq 0 ]] || { echo 'Run with sudo bash or as root.' >&2; return 1; }
    [[ $(uname -s) == Linux && -d /run/systemd/system ]] || { echo 'A Linux server running systemd is required.' >&2; return 1; }
    # shellcheck source=/dev/null
    . /etc/os-release
    case "${ID}:${VERSION_ID}" in debian:13|ubuntu:24.04|ubuntu:26.04) ;; *) echo 'Supported: Debian 13, Ubuntu 24.04 / 26.04.' >&2; return 1 ;; esac
    local arch node_arch
    case "$(uname -m)" in x86_64) arch=amd64; node_arch=x64 ;; aarch64|arm64) arch=arm64; node_arch=arm64 ;; *) echo 'Use an x86_64 or ARM64 server.' >&2; return 1 ;; esac
    local port="${BOAN_PORT:-2053}" ref="${BOAN_REF:-main}"
    [[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || { echo 'Invalid BOAN_PORT.' >&2; return 1; }
    port=$((10#$port))
    [[ "$ref" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ && "$ref" != *..* ]] || { echo 'Invalid BOAN_REF.' >&2; return 1; }
    local path
    for path in /usr/local/x-ui /etc/x-ui /etc/default/x-ui /etc/systemd/system/x-ui.service /usr/bin/x-ui /root/boan-login.txt; do
        [[ ! -e "$path" && ! -L "$path" ]] || { echo "Existing $path found. This installer does not overwrite installations." >&2; return 1; }
    done
    if command -v ss >/dev/null && ss -Hln "sport = :$port" | grep -q .; then
        echo "Port $port is in use; choose BOAN_PORT." >&2; return 1
    fi
    umask 077
    [[ ! -L /root/boan-install.log ]] || { echo 'Refusing symlink at /root/boan-install.log.' >&2; return 1; }
    touch /root/boan-install.log
    chmod 600 /root/boan-install.log
    exec > >(tee -a /root/boan-install.log) 2>&1
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl git build-essential unzip xz-utils tar python3 openssl cron socat iproute2
    local work
    work=$(mktemp -d /var/tmp/boan-build.XXXXXXXX)
    # Keep build failures isolated from the final installation and keep their log.
    trap 'code=$?; echo "Installation failed (exit $code). Check /root/boan-install.log. Build directory: ${work:-not created}" >&2; exit "$code"' ERR
    git clone --depth 1 --branch "$ref" https://github.com/AlexGe2003/boan.git "$work/source"
    cd "$work/source"
    local commit go_version go_archive go_sha node_archive
    commit=$(git rev-parse HEAD)
    go_version=$(awk '$1 == "go" {print $2}' go.mod)
    fetch -o "$work/go-downloads.json" 'https://go.dev/dl/?mode=json&include=all'
    read -r go_archive go_sha < <(python3 - "$work/go-downloads.json" "$go_version" "$arch" <<'PY'
import json, sys
for release in json.load(open(sys.argv[1])):
    if release['version'] != 'go' + sys.argv[2]:
        continue
    for asset in release['files']:
        if asset['os'] == 'linux' and asset['arch'] == sys.argv[3] and asset['kind'] == 'archive':
            print(asset['filename'], asset['sha256'])
            sys.exit(0)
sys.exit('Required Go toolchain not found in official download manifest')
PY
    )
    [[ "$go_archive" =~ ^go[0-9.]+\.linux-(amd64|arm64)\.tar\.gz$ && "$go_sha" =~ ^[a-f0-9]{64}$ ]]
    fetch -o "$work/$go_archive" "https://go.dev/dl/$go_archive"
    printf '%s  %s\n' "$go_sha" "$work/$go_archive" | sha256sum -c -
    mkdir -p "$work/toolchain"
    tar -xzf "$work/$go_archive" -C "$work/toolchain"
    local node_major
    node_major=$(tr -d '[:space:]' < .nvmrc)
    [[ "$node_major" =~ ^[0-9]+$ ]]
    fetch -o "$work/SHASUMS256.txt" "https://nodejs.org/dist/latest-v${node_major}.x/SHASUMS256.txt"
    node_archive=$(awk -v suffix="-linux-${node_arch}.tar.xz" 'substr($2,length($2)-length(suffix)+1)==suffix {print $2}' "$work/SHASUMS256.txt")
    [[ "$node_archive" =~ ^node-v[0-9.]+-linux-(x64|arm64)\.tar\.xz$ ]]
    fetch -o "$work/$node_archive" "https://nodejs.org/dist/latest-v${node_major}.x/$node_archive"
    (cd "$work"; awk -v name="$node_archive" '$2 == name' SHASUMS256.txt | sha256sum -c -)
    mkdir "$work/toolchain/node"
    tar -xJf "$work/$node_archive" --strip-components=1 -C "$work/toolchain/node"
    export PATH="$work/toolchain/go/bin:$work/toolchain/node/bin:$PATH"
    export GOTOOLCHAIN=local
    (cd frontend; npm ci; npm run build)
    mkdir -p build
    CGO_ENABLED=1 go build -trimpath -ldflags "-s -w -X github.com/mhsanaei/3x-ui/v3/internal/config.buildCommit=${commit:0:8}" -o build/x-ui .
    # Reuse the repository's Xray, GeoIP and protocol-runtime packaging.
    sh DockerInit.sh "$arch"
    build/x-ui entry -h > "$work/entry-help.txt" 2>&1 || [[ $? -eq 1 ]]
    grep -q -- '-block-domestic' "$work/entry-help.txt"
    install -d -m 755 /usr/local/x-ui
    cp -a build/. /usr/local/x-ui/
    install -m 755 x-ui.sh /usr/bin/x-ui
    install -m 644 x-ui.service.debian /etc/systemd/system/x-ui.service
    install -d -m 700 /etc/x-ui
    printf 'XUI_DB_FOLDER=/etc/x-ui\nXUI_BIN_FOLDER=/usr/local/x-ui/bin\n' > /etc/default/x-ui
    chmod 600 /etc/default/x-ui
    printf '%s\n' "$commit" > /usr/local/x-ui/source-commit
    local username password base
    username="admin_$(openssl rand -hex 4)"
    password=$(openssl rand -hex 20)
    base="/$(openssl rand -hex 12)/"
    export XUI_DB_FOLDER=/etc/x-ui XUI_BIN_FOLDER=/usr/local/x-ui/bin
    /usr/local/x-ui/x-ui setting -port "$port" -username "$username" -password "$password" -webBasePath "$base" -listenIP 127.0.0.1
    # The legacy settings CLI can print an error without a nonzero exit status.
    python3 - "$username" "$port" "$base" <<'PY'
import sqlite3, sys
with sqlite3.connect('/etc/x-ui/x-ui.db') as db:
    settings = dict(db.execute('select key,value from settings'))
    account = db.execute('select password from users where username=?', (sys.argv[1],)).fetchone()
    assert account and account[0].startswith(('$2a$', '$2b$')), 'Admin initialization failed'
    for key, value in [('webPort', sys.argv[2]), ('webBasePath', sys.argv[3]), ('webListen', '127.0.0.1')]:
        assert settings.get(key) == value, f'{key} initialization failed'
PY
    printf 'Commit: %s\nLocal URL: http://127.0.0.1:%s%s\nUsername: %s\nPassword: %s\n' "$commit" "$port" "$base" "$username" "$password" > /root/boan-login.txt
    chmod 600 /root/boan-login.txt
    systemctl daemon-reload
    systemctl enable --now x-ui
    local ready=0
    for attempt in {1..30}; do
        if curl -fsS "http://127.0.0.1:${port}${base}login" >/dev/null && systemctl is-active --quiet x-ui; then ready=1; break; fi
        sleep 1
    done
    [[ "$ready" == 1 ]] || { journalctl -u x-ui -n 40 --no-pager; return 1; }
    cd /root
    rm -rf -- "$work"
    trap - ERR
    echo 'Installed Boan successfully. Credentials: /root/boan-login.txt (root only).'
    echo "Initial access: SSH tunnel to 127.0.0.1:${port}. Run x-ui entry to configure domains and SSL."
    echo 'The website is not publicly listening yet. See docs/deployment.zh-CN.md before exposing it.'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    case "${1:-}" in -h|--help) usage ;; '') install_source ;; *) usage; exit 2 ;; esac
fi
