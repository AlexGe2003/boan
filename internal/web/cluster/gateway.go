package cluster

import (
	"context"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/util/netsafe"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

// Gateway keeps each member's URL usable with the primary's accounts, session
// and CSRF checks. Browser traffic is never upgraded to the node admin token.
// Bearer/mTLS RPCs remain local so the primary can operate the dataplane.
func Gateway(base string) gin.HandlerFunc {
	return func(c *gin.Context) {
		rel := strings.TrimPrefix(c.Request.URL.Path, base)
		if !strings.HasPrefix(c.Request.URL.Path, base) {
			c.Next()
			return
		}
		// RPC and recovery controls do not take the request read lock: they
		// acquire the exclusive handoff lock themselves.
		control := strings.HasPrefix(rel, "panel/api/cluster/")
		if rel == "panel/api/cluster/rpc" {
			c.Next()
			return
		}
		Gate.RLock()
		locked := true
		defer func() {
			if locked {
				Gate.RUnlock()
			}
		}()
		s, err := Load(database.GetDB())
		if err != nil {
			c.AbortWithStatusJSON(503, gin.H{"success": false, "msg": "Cluster state unavailable"})
			return
		}
		if control && (s == nil || s.Primary == s.Self || (s.Next != nil && s.Next.Coordinator == s.Self)) {
			Gate.RUnlock()
			locked = false
			c.Next()
			return
		}
		if s == nil {
			if rel == "ws" {
				Gate.RUnlock()
				locked = false
			}
			c.Next()
			return
		}
		if s.Phase != "active" && !control {
			if c.Request.Method == http.MethodGet && strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ") {
				c.Next()
				return
			}
			// Existing administrators can reopen the Nodes page and resume a
			// frozen journal. Business APIs and dataplane writes stay fenced.
			if (c.Request.Method == http.MethodGet && (!strings.HasPrefix(rel, "panel/api/") && rel != "ws" || rel == "panel/api/setting/session")) || rel == "login" || rel == "logout" {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(503, gin.H{"success": false, "msg": "主站交接进行中，请在发起站恢复交接"})
			return
		}
		if strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ") || (c.Request.TLS != nil && len(c.Request.TLS.VerifiedChains) > 0) {
			c.Next()
			return
		}
		if s.Primary == s.Self {
			if rel == "ws" {
				Gate.RUnlock()
				locked = false
			}
			c.Next()
			return
		}
		peer, err := s.Peer(s.Primary)
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		// Bound forwarded requests to one hop, including malformed cluster graphs.
		hops, hopErr := strconv.Atoi(c.GetHeader("X-Boan-Cluster-Hop"))
		if c.GetHeader("X-Boan-Cluster-Hop") != "" && (hopErr != nil || hops < 0 || hops >= 3) {
			c.AbortWithStatus(508)
			return
		}
		Gate.RUnlock()
		locked = false
		n := peer.Node
		client, err := runtime.HTTPClientForNode(&n, "")
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		target := &url.URL{Scheme: n.Scheme, Host: net.JoinHostPort(n.Address, strconv.Itoa(n.Port))}
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.Transport = client.Transport
		original := proxy.Director
		proxy.Director = func(r *http.Request) {
			original(r)
			r.Host = target.Host
			r.Header.Set("X-Boan-Cluster-Hop", strconv.Itoa(hops+1))
			r.Header.Del("Forwarded")
			r.Header.Del("X-Forwarded-Host")
			r.Header.Del("X-Forwarded-Proto")
		}
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, e error) {
			http.Error(w, "当前主站暂时不可用；不会自动提升其他节点", 503)
		}
		ctx := netsafe.ContextWithAllowPrivate(c.Request.Context(), n.AllowPrivateAddress)
		if rel != "ws" {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, 45*time.Second)
			defer cancel()
		}
		c.Request = c.Request.WithContext(ctx)
		// The primary renders the inline bootstrap nonce. A second local CSP
		// would require both different nonces and prevent the login page loading.
		c.Writer.Header().Del("Content-Security-Policy")
		proxy.ServeHTTP(c.Writer, c.Request)
		c.Abort()
	}
}
