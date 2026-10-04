package geoblock

import (
	"fmt"
	"net/netip"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	xraygeodata "github.com/xtls/xray-core/common/geodata"
	"go4.org/netipx"
	"google.golang.org/protobuf/proto"
)

var countries = map[string]bool{"CN": true, "HK": true, "MO": true, "TW": true}

type Matcher struct {
	mu       sync.RWMutex
	path     string
	regions  string
	size     int64
	modified time.Time
	ipSet    *netipx.IPSet
}

// Load preserves the original four-region policy for existing callers.
func (m *Matcher) Load(path string) error { return m.LoadRegions(path, "CN,HK,MO,TW") }

func NormalizeRegions(raw string) (string, error) {
	seen := map[string]bool{}
	for _, code := range strings.Split(strings.ToUpper(raw), ",") {
		code = strings.TrimSpace(code)
		if !countries[code] {
			return "", fmt.Errorf("unsupported website region %q (use CN, HK, MO, TW)", code)
		}
		seen[code] = true
	}
	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return strings.Join(codes, ","), nil
}

func (m *Matcher) LoadRegions(path, regions string) error {
	regions, err := NormalizeRegions(regions)
	if err != nil {
		return err
	}
	selected := map[string]bool{}
	for _, code := range strings.Split(regions, ",") {
		selected[code] = true
	}

	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("read geoip.dat: %w", err)
	}
	m.mu.RLock()
	current := m.regions == regions && m.path == path && m.size == info.Size() && m.modified.Equal(info.ModTime())
	m.mu.RUnlock()
	if current {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read geoip.dat: %w", err)
	}
	var list xraygeodata.GeoIPList
	if err := proto.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("parse geoip.dat: %w", err)
	}
	seen := make(map[string]bool, len(selected))
	var builder netipx.IPSetBuilder
	for _, entry := range list.GetEntry() {
		code := strings.ToUpper(entry.GetCode())
		if !selected[code] {
			continue
		}
		if len(entry.GetCidr()) == 0 {
			return fmt.Errorf("invalid or empty %s region in geoip.dat", code)
		}
		seen[code] = true
		for _, cidr := range entry.GetCidr() {
			addr, ok := netip.AddrFromSlice(cidr.GetIp())
			if !ok || int(cidr.GetPrefix()) > addr.BitLen() {
				return fmt.Errorf("invalid %s CIDR in geoip.dat", code)
			}
			builder.AddPrefix(netip.PrefixFrom(addr, int(cidr.GetPrefix())).Masked())
		}
	}
	for code := range selected {
		if !seen[code] {
			return fmt.Errorf("geoip.dat is missing %s", code)
		}
	}
	ipSet, err := builder.IPSet()
	if err != nil {
		return fmt.Errorf("build geoip.dat matcher: %w", err)
	}
	m.mu.Lock()
	m.path, m.regions, m.size, m.modified, m.ipSet = path, regions, info.Size(), info.ModTime(), ipSet
	m.mu.Unlock()
	return nil
}

func (m *Matcher) Contains(addr netip.Addr) bool {
	addr = addr.Unmap()
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ipSet != nil && m.ipSet.Contains(addr)
}
