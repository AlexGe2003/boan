package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/geoblock"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func WebsiteGeoBlock() gin.HandlerFunc {
	settings := &service.SettingService{}
	matcher := &geoblock.Matcher{}
	return func(c *gin.Context) {
		enabled, err := settings.GetWebsiteGeoBlockEnable()
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		if !enabled {
			c.Next()
			return
		}
		if err := matcher.Load(xray.GetGeoipPath()); err != nil {
			logger.Warning("website geo block unavailable: ", err)
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		trusted, err := settings.GetTrustedProxyCIDRs()
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		if ip, ok := websiteVisitorIP(c.Request, trusted); ok && matcher.Contains(ip) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	}
}

func websiteVisitorIP(r *http.Request, trusted string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	peer = peer.Unmap()
	if !websiteTrustedProxy(peer, trusted) {
		return peer, true
	}
	forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(forwarded) - 1; i >= 0; i-- {
		candidate, err := netip.ParseAddr(strings.TrimSpace(forwarded[i]))
		if err != nil {
			break
		}
		peer = candidate.Unmap()
		if !websiteTrustedProxy(peer, trusted) {
			break
		}
	}
	return peer, true
}

func websiteTrustedProxy(addr netip.Addr, configured string) bool {
	for value := range strings.SplitSeq(configured, ",") {
		value = strings.TrimSpace(value)
		if prefix, err := netip.ParsePrefix(value); err == nil && prefix.Contains(addr) {
			return true
		}
		if ip, err := netip.ParseAddr(value); err == nil && ip.Unmap() == addr {
			return true
		}
	}
	return false
}
