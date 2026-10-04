package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"net/http"
)

// EntryPointGate runs after session decoding and before any page or API route.
func EntryPointGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		p, err := (&service.SettingService{}).GetEntryPoints()
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		if p.AdminURL == "" {
			c.Next()
			return
		}
		c.Header("Cache-Control", "no-store")
		host := service.RequestHost(c.Request.Host)
		if host != service.EntryHost(p.AdminURL) && (host != service.EntryHost(p.UserURL) || !p.UserEnabled) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		if user := session.GetLoginUser(c); user != nil && !p.Allows(host, user.IsAdmin()) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	}
}

// CheckEntryRole also applies after bearer-token authentication and at login.
func CheckEntryRole(c *gin.Context, admin bool) bool {
	p, err := (&service.SettingService{}).GetEntryPoints()
	if err != nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return false
	}
	if !p.Allows(c.Request.Host, admin) {
		c.AbortWithStatus(http.StatusForbidden)
		return false
	}
	return true
}
