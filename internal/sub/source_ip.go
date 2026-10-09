package sub

import (
	"net"
	"net/netip"
	"strings"

	"github.com/gin-gonic/gin"
)

func (a *SUBController) subscriptionSourceIP(c *gin.Context) string {
	peer := c.Request.RemoteAddr
	if host, _, err := net.SplitHostPort(peer); err == nil {
		peer = host
	}
	ip, err := netip.ParseAddr(peer)
	if err != nil {
		return ""
	}
	peer = ip.Unmap().String()
	trusted, err := a.settingService.GetTrustedProxyCIDRs()
	if err != nil || !remoteAddrInCIDRs(peer, trusted) {
		return peer
	}
	if realIP, err := netip.ParseAddr(strings.TrimSpace(c.GetHeader("X-Real-IP"))); err == nil {
		return realIP.Unmap().String()
	}
	chain := strings.Split(c.GetHeader("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		forwarded, err := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if err != nil {
			return peer
		}
		candidate := forwarded.Unmap().String()
		if !remoteAddrInCIDRs(candidate, trusted) {
			return candidate
		}
	}
	return peer
}
