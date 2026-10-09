package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestClientConnectionsScopesAndNormalizesSources(t *testing.T) {
	now := time.Unix(1000, 0)
	r := clientConnectionsFromUsers("alice", []xray.OnlineUser{
		{Email: "alice", IPs: []xray.OnlineIP{{IP: "192.0.2.1", LastSeen: 900}, {IP: "::ffff:192.0.2.1", LastSeen: 950}, {IP: "2001:db8::1", LastSeen: 960}, {IP: "127.0.0.1"}, {IP: "not-an-ip"}}},
		{Email: "bob", IPs: []xray.OnlineIP{{IP: "192.0.2.99", LastSeen: 999}}},
	}, now)
	if r.Status != "ready" || r.OnlineSourceCount != 2 || len(r.Connections) != 2 {
		t.Fatalf("unexpected source counts: %+v", r)
	}
	if r.Connections[0].IP != "2001:db8::1" || r.Connections[1].LastSeen != 950000 {
		t.Fatalf("sources not canonicalized or sorted: %+v", r.Connections)
	}
	missing := clientConnectionsFromUsers("absent", []xray.OnlineUser{{Email: "bob", IPs: []xray.OnlineIP{{IP: "192.0.2.99"}}}}, now)
	if missing.Status != "ready" || missing.OnlineSourceCount != 0 || len(missing.Connections) != 0 {
		t.Fatalf("empty successful query must remain distinct from collection failure: %+v", missing)
	}
}

func TestMergeClientConnectionsDeduplicatesAcrossNodesAndReportsPartial(t *testing.T) {
	parts := []clientConnectionPart{
		{source: ClientConnectionSource{NodeID: 1, Name: "HK"}, data: ClientConnectionReport{Status: "ready", OnlineSourceCount: 999, Connections: []ClientConnection{{IP: "192.0.2.1", NodeID: 999, NodeName: "wrong"}, {IP: "::ffff:192.0.2.1"}}}},
		{source: ClientConnectionSource{NodeID: 2, Name: "JP"}, data: ClientConnectionReport{Status: "ready", Connections: []ClientConnection{{IP: "192.0.2.1"}}}},
		{source: ClientConnectionSource{NodeID: 3, Name: "Unavailable"}, data: ClientConnectionReport{Status: "unavailable", Connections: []ClientConnection{{IP: "192.0.2.2"}}}},
	}
	r := mergeClientConnections(parts, time.Now())
	if r.Status != "partial" || r.OnlineSourceCount != 1 || len(r.Connections) != 2 || len(r.Sources) != 3 {
		t.Fatalf("must count source addresses, preserving per-node rows and incomplete collection: %+v", r)
	}
	if r.Connections[0].NodeID != 1 || r.Connections[0].NodeName != "HK" || r.Connections[1].NodeID != 2 {
		t.Fatalf("remote node identity must not replace configured identity: %+v", r.Connections)
	}
	if got := mergeClientConnections(parts[:2], time.Now()); got.Status != "ready" {
		t.Fatalf("all available nodes: %+v", got)
	}
	if got := mergeClientConnections(parts[2:], time.Now()); got.Status != "unavailable" || len(got.Connections) != 0 {
		t.Fatalf("unavailable nodes must not invent live sources: %+v", got)
	}
}

func TestClientDevicesTracksSubscriptionIdentityWithoutClaimingOnline(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	svc := &ClientService{}
	empty, err := svc.Devices(context.Background(), rec.Email)
	if err != nil || empty.Registered != 0 || empty.Devices == nil || empty.Connections.Status != "unavailable" {
		t.Fatalf("no identifiers does not establish offline devices: %+v, %v", empty, err)
	}
	for _, ip := range []string{"192.0.2.1", "::ffff:192.0.2.2"} {
		if _, err := svc.EnforceHwidForSubID(rec.SubID, HwidRequest{Hwid: "physical-device-one", UserAgent: "Happ/1", DeviceModel: "Phone", SourceIP: ip}); err != nil {
			t.Fatal(err)
		}
	}
	r, err := svc.Devices(context.Background(), rec.Email)
	if err != nil || r.Registered != 1 || r.Devices[0].LastIP != "192.0.*.2" || r.Devices[0].FirstSeen <= 0 || r.Devices[0].LastSeen < r.Devices[0].FirstSeen {
		t.Fatalf("network changes must retain one device and update its subscription metadata: %+v, %v", r, err)
	}
	if r.Connections.Status != "unavailable" || r.Connections.OnlineSourceCount != 0 {
		t.Fatal("a subscription update must not be turned into an online connection")
	}
	raw, _ := json.Marshal(r)
	if strings.Contains(string(raw), "physical-device-one") || strings.Contains(string(raw), hashHwid("physical-device-one")) || strings.Contains(string(raw), rec.SubID) {
		t.Fatalf("report leaked full identity or subscription credentials: %s", raw)
	}
}

func TestClientDeviceSourceIPTracksLimitedRegistrations(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 1)
	svc := &ClientService{}
	for _, ip := range []string{"192.0.2.1", "2001:db8::2"} {
		if result, err := svc.EnforceHwidForSubID(rec.SubID, HwidRequest{Hwid: "device-one", SourceIP: ip}); err != nil || !result.Allowed {
			t.Fatalf("existing device rejected: %+v, %v", result, err)
		}
	}
	rows, err := svc.ListClientHwids(rec.Email)
	if err != nil || len(rows) != 1 || rows[0].LastIP != "2001:db8:0:*:*:*:*:*" {
		t.Fatalf("limited registration must update subscription source: %+v, %v", rows, err)
	}
	if req := normalizeHwidRequest(HwidRequest{SourceIP: "invalid-header"}); req.SourceIP != "" {
		t.Fatal("invalid source IP persisted")
	}
}

func TestClientDevicesIncludesLocalNullNodeAssignment(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	db := database.GetDB()
	inbound := model.Inbound{Tag: "local-device-test", UserId: 1, Enable: true, Protocol: model.VLESS, Port: 41001, Settings: `{"clients":[]}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: inbound.Id}).Error; err != nil {
		t.Fatal(err)
	}
	r, err := (&ClientService{}).Devices(context.Background(), rec.Email)
	if err != nil || len(r.Connections.Sources) != 1 || r.Connections.Sources[0].NodeID != 0 {
		t.Fatalf("local assignments use NULL node_id and must be queried: %+v, %v", r, err)
	}
}

func TestClientDevicesQueriesOnlyAssignedNodes(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	db := database.GetDB()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Header.Get("Authorization") != "Bearer assigned-token" || req.URL.Path != "/panel/api/clients/connections/"+rec.Email {
			t.Errorf("queried an unrelated node or client: %s %s", req.Header.Get("Authorization"), req.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"obj":{"status":"ready","connections":[{"ip":"192.0.2.1","lastSeen":1000}],"sources":[]}}`))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	port, _ := strconv.Atoi(u.Port())
	for id, token := range map[int]string{1: "assigned-token", 2: "unrelated-token"} {
		seedNodeRow(t, db, &model.Node{Id: id, Name: token, Enable: true, Address: u.Hostname(), Port: port, Scheme: "http", BasePath: "/", ApiToken: token, AllowPrivateAddress: true})
	}
	nodeID := 1
	inbound := model.Inbound{Tag: "remote-device-test", UserId: 1, NodeID: &nodeID, Enable: true, Protocol: model.VLESS, Port: 41001, Settings: `{"clients":[]}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: inbound.Id}).Error; err != nil {
		t.Fatal(err)
	}
	previous := runtime.GetManager()
	runtime.SetManager(runtime.NewManager(runtime.LocalDeps{}))
	t.Cleanup(func() { runtime.SetManager(previous) })
	r, err := (&ClientService{}).Devices(context.Background(), rec.Email)
	if err != nil || r.Connections.Status != "ready" || len(r.Connections.Sources) != 1 || r.Connections.OnlineSourceCount != 1 {
		t.Fatalf("assigned-node query failed: %+v, %v", r, err)
	}
}
