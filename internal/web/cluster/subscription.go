package cluster

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/netsafe"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

type SubscriptionEndpoint struct {
	Enabled bool     `json:"enabled"`
	Port    int      `json:"port"`
	Domain  string   `json:"domain"`
	Scheme  string   `json:"scheme"`
	Pin     string   `json:"pin"`
	Paths   []string `json:"paths"`
	JSON    bool     `json:"json"`
	Clash   bool     `json:"clash"`
}

func subscriptionEndpoint() (SubscriptionEndpoint, error) {
	defaults := map[string]string{"subEnable": "true", "subPort": "2096", "subPath": "/sub/", "subJsonPath": "/json/", "subClashPath": "/clash/", "subJsonEnable": "false", "subClashEnable": "true"}
	var rows []model.Setting
	if err := database.GetDB().Where("key LIKE ?", "sub%").Find(&rows).Error; err != nil {
		return SubscriptionEndpoint{}, err
	}
	for _, s := range rows {
		defaults[s.Key] = s.Value
	}
	port, err := strconv.Atoi(defaults["subPort"])
	if err != nil {
		return SubscriptionEndpoint{}, err
	}
	result := SubscriptionEndpoint{Enabled: defaults["subEnable"] == "true", Port: port, Domain: defaults["subDomain"], Scheme: "http", Paths: []string{defaults["subPath"], defaults["subJsonPath"], defaults["subClashPath"]}, JSON: defaults["subJsonEnable"] == "true", Clash: defaults["subClashEnable"] == "true"}
	if defaults["subCertFile"] != "" && defaults["subKeyFile"] != "" {
		raw, err := os.ReadFile(defaults["subCertFile"])
		if err != nil {
			return result, err
		}
		block, _ := pem.Decode(raw)
		if block == nil || block.Type != "CERTIFICATE" {
			return result, errors.New("invalid subscription certificate")
		}
		sum := sha256.Sum256(block.Bytes)
		result.Scheme = "https"
		result.Pin = hex.EncodeToString(sum[:])
	}
	return result, nil
}

// SubscriptionGateway preserves existing subscription URLs after a handoff.
// It forwards requests using each destination's own public subscription paths;
// no management credential is attached to these public requests.
func SubscriptionGateway() gin.HandlerFunc {
	return func(c *gin.Context) {
		Gate.RLock()
		locked := true
		defer func() {
			if locked {
				Gate.RUnlock()
			}
		}()
		s, err := Load(database.GetDB())
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		if s == nil {
			c.Next()
			return
		}
		if s.Phase != "active" {
			c.AbortWithStatus(503)
			return
		}
		if s.Self == s.Primary {
			c.Next()
			return
		}
		self, err := s.Peer(s.Self)
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		destination, err := s.Peer(s.Primary)
		if err != nil || !destination.Subscription.Enabled {
			c.AbortWithStatus(503)
			return
		}
		if c.GetHeader("X-Boan-Cluster-Hop") != "" {
			c.AbortWithStatus(508)
			return
		}
		path := c.Request.URL.Path
		matched := false
		for i, prefix := range self.Subscription.Paths {
			if strings.HasPrefix(path, prefix) && i < len(destination.Subscription.Paths) {
				path = destination.Subscription.Paths[i] + strings.TrimPrefix(path, prefix)
				matched = true
				break
			}
		}
		if !matched {
			c.AbortWithStatus(404)
			return
		}
		n := destination.Node
		n.ApiToken = ""
		n.Scheme = destination.Subscription.Scheme
		n.Port = destination.Subscription.Port
		n.TlsVerifyMode = "verify"
		if destination.Subscription.Domain != "" {
			n.Address = destination.Subscription.Domain
		}
		if destination.Subscription.Pin != "" {
			n.TlsVerifyMode = "pin"
			n.PinnedCertSha256 = destination.Subscription.Pin
		}
		client, err := runtime.HTTPClientForNode(&n, "")
		if err != nil {
			c.AbortWithStatus(503)
			return
		}
		Gate.RUnlock()
		locked = false
		target := &url.URL{Scheme: n.Scheme, Host: net.JoinHostPort(n.Address, strconv.Itoa(n.Port))}
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.Transport = client.Transport
		director := proxy.Director
		proxy.Director = func(r *http.Request) {
			director(r)
			r.Host = target.Host
			r.URL.Path = path
			r.URL.RawPath = ""
			r.Header.Set("X-Boan-Cluster-Hop", "1")
			r.Header.Del("Authorization")
			r.Header.Del("Cookie")
		}
		ctx, cancel := context.WithTimeout(netsafe.ContextWithAllowPrivate(c.Request.Context(), n.AllowPrivateAddress), 45*time.Second)
		defer cancel()
		c.Request = c.Request.WithContext(ctx)
		proxy.ServeHTTP(c.Writer, c.Request)
		c.Abort()
	}
}
