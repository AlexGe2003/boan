package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	xraygeodata "github.com/xtls/xray-core/common/geodata"
	"google.golang.org/protobuf/proto"
)

func TestEntryGeoCLIEnableShowDisable(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XUI_DB_FOLDER", dir)
	t.Setenv("XUI_BIN_FOLDER", dir)
	list := &xraygeodata.GeoIPList{}
	for i, code := range []string{"CN", "HK", "MO", "TW"} {
		list.Entry = append(list.Entry, &xraygeodata.GeoIP{Code: code, Cidr: []*xraygeodata.CIDR{{Ip: []byte{byte(i + 1), 0, 0, 0}, Prefix: 8}}})
	}
	data, err := proto.Marshal(list)
	if err != nil {
		t.Fatal(err)
	}
	geoPath := filepath.Join(dir, "geoip.dat")
	if err = os.WriteFile(geoPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) string {
		t.Helper()
		var out bytes.Buffer
		if err := entryPointsCLI(args, &out); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	run("-block-domestic", "true", "-trusted-proxies", "127.0.0.1/32,::1/128")
	var snapshot struct {
		Enabled bool   `json:"websiteGeoBlockEnabled"`
		Regions string `json:"websiteBlockedRegions"`
		Proxies string `json:"trustedProxyCIDRs"`
	}
	if err = json.Unmarshal([]byte(run("-show")), &snapshot); err != nil {
		t.Fatal(err)
	}
	if !snapshot.Enabled || snapshot.Regions != "CN,HK,MO,TW" || snapshot.Proxies != "127.0.0.1/32,::1/128" {
		t.Fatalf("wrong policy: %+v", snapshot)
	}
	if err = os.Remove(geoPath); err != nil {
		t.Fatal(err)
	}
	run("-block-domestic", "false")
	if err = json.Unmarshal([]byte(run("-show")), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Enabled {
		t.Fatal("disable did not persist")
	}
	var out bytes.Buffer
	if err = entryPointsCLI([]string{"-block-domestic", "true"}, &out); err == nil {
		t.Fatal("enabled without database")
	}
	run("-trusted-proxies", "")
	if err = json.Unmarshal([]byte(run("-show")), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Proxies != "" {
		t.Fatal("could not clear proxies")
	}
}
