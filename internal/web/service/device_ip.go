package service

import (
	"fmt"
	"net/netip"
	"strings"
)

// MaskDeviceIP keeps the prefix and IPv4 tail visible without exposing a full address.
func MaskDeviceIP(raw string) string {
	ip, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	ip = ip.Unmap()
	if ip.Is4() {
		bytes := ip.As4()
		return fmt.Sprintf("%d.%d.*.%d", bytes[0], bytes[1], bytes[3])
	}
	bytes := ip.As16()
	return fmt.Sprintf("%x:%x:%x:*:*:*:*:*", uint16(bytes[0])<<8|uint16(bytes[1]), uint16(bytes[2])<<8|uint16(bytes[3]), uint16(bytes[4])<<8|uint16(bytes[5]))
}

func maskDeviceConnections(report *ClientConnectionReport) {
	for i := range report.Connections {
		report.Connections[i].IP = MaskDeviceIP(report.Connections[i].IP)
	}
}
