package geoblock

import (
	"net/netip"
	"os"
	"path/filepath"
	"testing"

	xraygeodata "github.com/xtls/xray-core/common/geodata"
	"google.golang.org/protobuf/proto"
)

func TestMatcherRequiresAllFourRegionsAndReloads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "geoip.dat")
	write := func(codes ...string) {
		t.Helper()
		list := &xraygeodata.GeoIPList{}
		for i, code := range codes {
			list.Entry = append(list.Entry, &xraygeodata.GeoIP{
				Code: code,
				Cidr: []*xraygeodata.CIDR{{Ip: []byte{byte(i + 1), 0, 0, 0}, Prefix: 8}},
			})
		}
		data, err := proto.Marshal(list)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	m := &Matcher{}
	write("CN", "HK", "MO")
	if err := m.Load(path); err == nil {
		t.Fatal("missing Taiwan category accepted")
	}
	write("CN", "HK", "MO", "TW")
	if err := m.Load(path); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"1.2.3.4", "2.2.3.4", "3.2.3.4", "4.2.3.4"} {
		if !m.Contains(netip.MustParseAddr(raw)) {
			t.Fatalf("%s should be blocked", raw)
		}
	}
	if m.Contains(netip.MustParseAddr("5.2.3.4")) {
		t.Fatal("unlisted IP blocked")
	}
}

func TestMatcherRegionSelectionIPv6AndPolicyReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "geoip.dat")
	ipv6 := netip.MustParseAddr("2001:db8::")
	data, err := proto.Marshal(&xraygeodata.GeoIPList{Entry: []*xraygeodata.GeoIP{
		{Code: "CN", Cidr: []*xraygeodata.CIDR{{Ip: []byte{1, 0, 0, 0}, Prefix: 8}, {Ip: ipv6.AsSlice(), Prefix: 32}}},
		{Code: "HK", Cidr: []*xraygeodata.CIDR{{Ip: []byte{2, 0, 0, 0}, Prefix: 8}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	m := &Matcher{}
	if err = m.LoadRegions(path, "cn"); err != nil {
		t.Fatal(err)
	}
	for _, ip := range []string{"1.2.3.4", "::ffff:1.2.3.4", "2001:db8::1"} {
		if !m.Contains(netip.MustParseAddr(ip)) {
			t.Fatalf("did not block %s", ip)
		}
	}
	if m.Contains(netip.MustParseAddr("2.2.3.4")) {
		t.Fatal("CN-only policy blocked HK")
	}
	// Same file metadata, different selected regions: cache must rebuild.
	if err = m.LoadRegions(path, "CN,HK"); err != nil {
		t.Fatal(err)
	}
	if !m.Contains(netip.MustParseAddr("2.2.3.4")) {
		t.Fatal("policy change did not reload")
	}
	if err = m.LoadRegions(path, "CN,HK,MO,TW"); err == nil {
		t.Fatal("accepted missing required regions")
	}
	if _, err = NormalizeRegions("CN,TYPO"); err == nil {
		t.Fatal("accepted unknown region")
	}
}
