package cluster

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestExistingSubscriptionURLFollowsPrimaryWithoutAdminCredentials(t *testing.T) {
	setup(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"path": r.URL.RequestURI(), "authorization": r.Header.Get("Authorization"), "cookie": r.Header.Get("Cookie")})
	}))
	defer upstream.Close()
	endpoint, _ := url.Parse(upstream.URL)
	port, _ := strconv.Atoi(endpoint.Port())
	state := &State{ClusterID: "x", Self: "a", Primary: "b", Epoch: 2, Phase: "active", Peers: []Peer{
		{Node: model.Node{Guid: "a"}, Subscription: SubscriptionEndpoint{Enabled: true, Paths: []string{"/old/"}}},
		{Node: model.Node{Guid: "b", Address: endpoint.Hostname(), AllowPrivateAddress: true}, Token: "never-forward-this", Subscription: SubscriptionEndpoint{Enabled: true, Scheme: "http", Port: port, Paths: []string{"/new/"}}},
	}}
	if err := Save(database.GetDB(), state); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(SubscriptionGateway())
	engine.GET("/old/:id", func(c *gin.Context) { t.Error("served stale local subscription") })
	req := httptest.NewRequest(http.MethodGet, "/old/subscriber?format=clash", nil)
	req.Header.Set("Authorization", "Bearer original-token")
	req.Header.Set("Cookie", "3x-ui=old-session")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var got map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["path"] != "/new/subscriber?format=clash" || got["authorization"] != "" || got["cookie"] != "" {
		t.Fatalf("bad subscription routing: %#v", got)
	}
}
