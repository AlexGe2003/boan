package geoblock

import (
	"fmt"
	"net/netip"
	"os"
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
	size     int64
	modified time.Time
	ipSet    *netipx.IPSet
}

func (m *Matcher) Load(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("read geoip.dat: %w", err)
	}
	m.mu.RLock()
	current := m.path == path && m.size == info.Size() && m.modified.Equal(info.ModTime())
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
	seen := make(map[string]bool, len(countries))
	var builder netipx.IPSetBuilder
	for _, entry := range list.GetEntry() {
		code := entry.GetCode()
		if !countries[code] {
			continue
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
	for code := range countries {
		if !seen[code] {
			return fmt.Errorf("geoip.dat is missing %s", code)
		}
	}
	ipSet, err := builder.IPSet()
	if err != nil {
		return fmt.Errorf("build geoip.dat matcher: %w", err)
	}
	m.mu.Lock()
	m.path, m.size, m.modified, m.ipSet = path, info.Size(), info.ModTime(), ipSet
	m.mu.Unlock()
	return nil
}

func (m *Matcher) Contains(addr netip.Addr) bool {
	addr = addr.Unmap()
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ipSet != nil && m.ipSet.Contains(addr)
}
