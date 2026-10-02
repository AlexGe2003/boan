package cluster

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/op/go-logging"
)

func setup(t *testing.T) {
	t.Helper()
	logger.InitLogger(logging.ERROR)
	if err := database.InitDB(filepath.Join(t.TempDir(), "cluster.db")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.CloseDB() })
}
func TestSnapshotRoundTripPreservesAccountsAndLocalSettings(t *testing.T) {
	setup(t)
	db := database.GetDB()
	var admin model.User
	if err := db.First(&admin).Error; err != nil {
		t.Fatal(err)
	}
	originalName := admin.Username
	role := model.PanelRoleDefinition{Key: "custom_reader", Name: "Read only", Pages: `["/node-monitor"]`}
	if err := db.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	plan := model.SubscriptionPlan{Name: "Monthly", InboundIDs: "[]", Enabled: true}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatal(err)
	}
	order := model.ServiceOrder{ID: "order-1", UserID: admin.Id, PlanID: plan.ID, PlanName: plan.Name, Status: "paid", Amount: 990}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	snap, err := Capture(db)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	var copy Snapshot
	if err = json.Unmarshal(raw, &copy); err != nil {
		t.Fatal(err)
	}
	if err = db.Model(&admin).Update("username", "changed").Error; err != nil {
		t.Fatal(err)
	}
	local := model.Setting{Key: "panelGuid", Value: "local-guid"}
	if err = db.Create(&local).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Transaction(copy.Apply); err != nil {
		t.Fatal(err)
	}
	var restored model.User
	if err = db.First(&restored, admin.Id).Error; err != nil {
		t.Fatal(err)
	}
	if restored.Username != originalName || restored.Password != admin.Password {
		t.Fatal("account was not restored")
	}
	var setting model.Setting
	if err = db.Where("key = ?", "panelGuid").First(&setting).Error; err != nil {
		t.Fatal(err)
	}
	var savedRole model.PanelRoleDefinition
	if err = db.First(&savedRole, "key = ?", role.Key).Error; err != nil || savedRole.Pages != role.Pages {
		t.Fatalf("role lost: %v", err)
	}
	var savedOrder model.ServiceOrder
	if err = db.First(&savedOrder, "id = ?", order.ID).Error; err != nil || savedOrder.Amount != 990 || savedOrder.PlanID != plan.ID {
		t.Fatalf("order lost: %v", err)
	}
	if restored.LoginEpoch <= admin.LoginEpoch {
		t.Fatal("old destination sessions remain valid")
	}
	if setting.Value != "local-guid" {
		t.Fatal("overwrote machine identity")
	}
}
func TestHandoffTransitionsAreFencedAndIdempotent(t *testing.T) {
	setup(t)
	db := database.GetDB()
	peers := []Peer{{Node: model.Node{Guid: "a"}}, {Node: model.Node{Id: 1, Guid: "b"}}}
	current := &State{ClusterID: "fleet", Self: "b", Primary: "a", Epoch: 1, Phase: "active", Peers: peers}
	if err := Save(db, current); err != nil {
		t.Fatal(err)
	}
	next := *current
	next.Primary = "b"
	next.Epoch = 2
	if err := Receive("b", Packet{Action: "activate", State: &next}); err == nil {
		t.Fatal("activated without staged data")
	}
	if err := Receive("b", Packet{Action: "stage", State: &next, Snapshot: &Snapshot{}}); err == nil {
		t.Fatal("staged without freeze")
	}
	if err := Receive("b", Packet{Action: "freeze", State: current}); err != nil {
		t.Fatal(err)
	}
	snap, err := Capture(db)
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = Receive("b", Packet{Action: "stage", State: &next, Snapshot: snap}); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err = Receive("b", Packet{Action: "activate", State: &next}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := Load(db)
	if err != nil {
		t.Fatal(err)
	}
	if got.Primary != "b" || got.Epoch != 2 || got.Phase != "active" {
		t.Fatalf("unexpected state: %+v", Public(got))
	}
	if err = Receive("b", Packet{Action: "follow", State: current}); err == nil {
		t.Fatal("accepted old epoch")
	}
}
func TestRebasePreservesBusinessIDsAndSwapsPhysicalNodes(t *testing.T) {
	s := &Snapshot{Tables: map[string][]map[string]any{
		"inbounds":              {{"id": 10, "node_id": nil, "tag": "a", "settings": "{}", "port": 443, "protocol": "vless", "stream_settings": "{}"}, {"id": 20, "node_id": 1, "tag": "n1-b", "settings": "{}", "port": 8443, "protocol": "vless", "stream_settings": "{}"}},
		"nodes":                 {{"id": 1, "guid": "b"}},
		"client_traffics":       {{"inbound_id": 10, "email": "x", "up": 12, "down": 34}},
		"server_usage_controls": {{"node_id": 0}, {"node_id": 1}},
	}}
	a := Peer{Node: model.Node{Guid: "a", Name: "A"}, Token: "secret"}
	b := Peer{Node: model.Node{Id: 1, Guid: "b"}}
	local := []model.Inbound{{Tag: "b", Settings: "{}", Port: 8443, Protocol: model.VLESS, StreamSettings: "{}"}}
	if err := s.Rebase(a, b, local); err != nil {
		t.Fatal(err)
	}
	in := s.Tables["inbounds"]
	if integer(in[0]["id"]) != 10 || integer(in[0]["node_id"]) != 1 || in[1]["node_id"] != nil || in[1]["tag"] != "b" {
		t.Fatalf("bad placement: %#v", in)
	}
	if s.Tables["nodes"][0]["guid"] != "a" {
		t.Fatal("former primary missing")
	}
	baseline := s.Tables["node_client_traffics"]
	if len(baseline) != 1 || integer(baseline[0]["up"]) != 12 {
		t.Fatal("traffic baseline lost")
	}
}
func TestIncompleteImportRollsBack(t *testing.T) {
	setup(t)
	db := database.GetDB()
	before := int64(0)
	db.Model(&model.User{}).Count(&before)
	bad := Snapshot{Tables: map[string][]map[string]any{"users": {}}}
	if err := db.Transaction(bad.Apply); err == nil {
		t.Fatal("accepted incomplete snapshot")
	}
	var after int64
	db.Model(&model.User{}).Count(&after)
	if after != before {
		t.Fatal("import deleted accounts")
	}
}

func TestPublicStateNeverReturnsCredentialsOrSnapshot(t *testing.T) {
	raw, err := json.Marshal(Public(&State{ClusterID: "x", Peers: []Peer{{Node: model.Node{Name: "peer", ApiToken: "stored-secret"}, Token: "wire-secret"}}, Snapshot: &Snapshot{Tables: map[string][]map[string]any{"users": {{"password": "password-hash"}}}}}))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"stored-secret", "wire-secret", "password-hash"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("credential escaped public state")
		}
	}
}
func TestFrozenJournalSurvivesDatabaseReopen(t *testing.T) {
	logger.InitLogger(logging.ERROR)
	path := filepath.Join(t.TempDir(), "state.db")
	if err := database.InitDB(path); err != nil {
		t.Fatal(err)
	}
	if err := Save(database.GetDB(), &State{ClusterID: "x", Self: "a", Primary: "a", Epoch: 3, Phase: "frozen"}); err != nil {
		t.Fatal(err)
	}
	if err := database.CloseDB(); err != nil {
		t.Fatal(err)
	}
	if err := database.InitDB(path); err != nil {
		t.Fatal(err)
	}
	defer database.CloseDB()
	release, allowed := BeginJob(true)
	defer release()
	if allowed {
		t.Fatal("restart re-enabled a frozen primary")
	}
}
