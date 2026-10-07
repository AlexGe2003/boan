#!/bin/sh
set -eu
# Keep the protocol implementation pinned to the production 26.7.28 core.
revision='v1.260327.1-0.20260728075948-5ca6f4b7d4dc'
base_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output=${1:?Usage: build.sh /absolute/path/to/xray}
source_dir=$(go mod download -json "github.com/xtls/xray-core@$revision" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Dir"])')
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
cp -R "$source_dir/." "$work_dir/"
chmod -R u+w "$work_dir"
cp "$base_dir/usage.go" "$work_dir/app/dispatcher/boan_usage.go"
cp "$base_dir/usage_test.go" "$work_dir/app/dispatcher/boan_usage_test.go"
cd "$work_dir"
patch -p1 < "$base_dir/dispatcher.patch"
go test -race ./app/dispatcher -run TestUsage -count=1
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o "$output" ./main
