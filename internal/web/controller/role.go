package controller

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/middleware"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

// enforceRole lets admins and node-sync callers through. A panel user may only
// hit the routes roleAllows lists; resource ownership is checked in the handler.
func (a *APIController) enforceRole(c *gin.Context) {
	if user := session.GetLoginUser(c); user != nil && !middleware.CheckEntryRole(c, user.IsAdmin()) {
		return
	}
	if scope, ok := c.Get("api_token_scope"); ok && scope == model.ApiScopeNodeSync {
		c.Next()
		return
	}
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if user.IsAdmin() {
		c.Next()
		return
	}
	rel := relAPIPath(c.FullPath())
	if user.Role == model.RoleCustomer {
		if (c.Request.Method == http.MethodGet && (rel == "/commerce/plans" || rel == "/commerce/orders")) || (c.Request.Method == http.MethodPost && (rel == "/commerce/orders" || rel == "/commerce/orders/:id/cancel")) {
			c.Next()
			return
		}
		if (c.Request.Method == http.MethodGet && (rel == "/support/nodes" || rel == "/support/tickets" || rel == "/support/tickets/:id")) || (c.Request.Method == http.MethodPost && (rel == "/support/tickets" || rel == "/support/tickets/:id/reply" || rel == "/support/tickets/:id/close")) {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodPost && rel == "/clients/resetMySubscription" {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodGet && (rel == "/clients/mySubscriptions" || rel == "/setting/session") {
			c.Next()
			return
		}
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if roleAllows(c.Request.Method, rel) {
		pages, err := (&panel.UserService{}).RolePages(user.Role)
		if err == nil && routePageAllowed(rel, pages) {
			c.Next()
			return
		}
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
		"success": false,
		"msg":     I18nWeb(c, "pages.settings.security.forbidden"),
	})
}

func routePageAllowed(rel string, pages []string) bool {
	page := ""
	switch {
	case rel == "/inbounds/list/slim" || rel == "/inbounds/options":
		return hasAnyPage(pages, "/inbounds", "/clients", "/hosts")
	case strings.HasPrefix(rel, "/inbounds/"):
		page = "/inbounds"
	case rel == "/clients/mySubscriptions" || rel == "/clients/resetMySubscription":
		page = "/my-subscriptions"
	case strings.HasPrefix(rel, "/clients/"):
		page = "/clients"
	case strings.HasPrefix(rel, "/hosts/"):
		page = "/hosts"
	case rel == "/nodes/monitor":
		page = "/node-monitor"
	case rel == "/server/status" || strings.HasPrefix(rel, "/server/history/") ||
		strings.HasPrefix(rel, "/server/cpuHistory/") || strings.HasPrefix(rel, "/server/xrayMetrics") ||
		strings.HasPrefix(rel, "/server/xrayObservatory"):
		page = "/"
	}
	if page == "" {
		return true
	}
	return hasAnyPage(pages, page)
}

func hasAnyPage(pages []string, options ...string) bool {
	for _, page := range pages {
		for _, option := range options {
			if page == option {
				return true
			}
		}
	}
	return false
}

func roleAllows(method, rel string) bool {
	if strings.HasPrefix(rel, "/clients/account/") || rel == "/clients/resetSubscription/:email" {
		return false
	}
	switch {
	case strings.HasPrefix(rel, "/inbounds/"):
		switch rel {
		case "/inbounds/resetAllTraffics", "/inbounds/import", "/inbounds/pushClientTraffics", "/inbounds/bulkDel":
			return false
		}
		return true
	case strings.HasPrefix(rel, "/hosts/"):
		return true
	case strings.HasPrefix(rel, "/clients/"):
		if rel == "/clients/groups" || strings.HasPrefix(rel, "/clients/groups/") || strings.HasPrefix(rel, "/clients/bulk") {
			return false
		}
		switch rel {
		case "/clients/import", "/clients/export", "/clients/delOrphans", "/clients/resetAllTraffics",
			"/clients/delDepleted", "/clients/onlinesByGuid", "/clients/clientIpsByGuid",
			"/clients/get/tgId/:tgId", "/clients/happLink/:id", "/clients/onlines", "/clients/activeInbounds", "/clients/lastOnline":
			return false
		}
		return true
	}
	key := method + " " + rel
	_, ok := userRoleRoutes[key]
	return ok
}

var userRoleRoutes = map[string]struct{}{
	"GET /clients/mySubscriptions":                    {},
	"GET /nodes/monitor":                              {},
	"GET /server/status":                              {},
	"GET /server/cpuHistory/:bucket":                  {},
	"GET /server/history/:metric/:bucket":             {},
	"GET /server/xrayMetricsState":                    {},
	"GET /server/xrayMetricsHistory/:metric/:bucket":  {},
	"GET /server/xrayObservatory":                     {},
	"GET /server/xrayObservatoryHistory/:tag/:bucket": {},
	"GET /server/getNewUUID":                          {},
	"GET /server/getNewX25519Cert":                    {},
	"GET /server/getNewmldsa65":                       {},
	"GET /server/getNewmlkem768":                      {},
	"GET /server/getNewVlessEnc":                      {},
	"POST /server/getNewEchCert":                      {},
	"POST /server/getCertHash":                        {},
	"POST /server/getRemoteCertHash":                  {},
	"POST /server/scanRealityTarget":                  {},
	"POST /server/scanRealityTargets":                 {},
	"GET /server/clientIps":                           {},
	"POST /server/clientIps":                          {},
	"POST /setting/updateUser":                        {},
	"GET /setting/session":                            {},
}

func scopeUserID(user *model.User) int {
	if user != nil && user.IsAdmin() {
		return -1
	}
	if user == nil {
		return 0
	}
	return user.Id
}
