package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/geoblock"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

var websiteGeoMatcher geoblock.Matcher

// WebsiteGeoStatus is also used by existing WebSockets after the HTTP upgrade.
func WebsiteGeoStatus(r *http.Request) int {
	// Machine monitoring remains available independently of website visitor regions.
	// Authentication and endpoint scope checks still run in the API controller.
	if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/panel/api/nodes/status-feed") {
		if token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
			if row, valid := (&panel.ApiTokenService{}).MatchToken(token); valid && row.Scope == model.ApiScopeMonitor {
				return 0
			}
		}
	}

	settings := &service.SettingService{}
	enabled, err := settings.GetWebsiteGeoBlockEnable()
	if err != nil {
		return http.StatusServiceUnavailable
	}
	if !enabled {
		return 0
	}
	regions, err := settings.GetWebsiteGeoBlockRegions()
	if err != nil {
		return http.StatusServiceUnavailable
	}
	if err := websiteGeoMatcher.LoadRegions(xray.GetGeoipPath(), regions); err != nil {
		logger.Warning("website geo block unavailable: ", err)
		return http.StatusServiceUnavailable
	}
	trusted, err := settings.GetTrustedProxyCIDRs()
	if err != nil {
		return http.StatusServiceUnavailable
	}
	ip, ok := websiteVisitorIP(r, trusted)
	if !ok || websiteGeoMatcher.Contains(ip) {
		return http.StatusForbidden
	}
	return 0
}

func WebsiteGeoBlock() gin.HandlerFunc {
	return func(c *gin.Context) {
		if status := WebsiteGeoStatus(c.Request); status != 0 {
			c.Header("Cache-Control", "no-store")
			c.AbortWithStatus(status)
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
			return netip.Addr{}, false
		}
		peer = candidate.Unmap()
		if !websiteTrustedProxy(peer, trusted) {
			break
		}
	}
	return peer, !websiteTrustedProxy(peer, trusted)
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
