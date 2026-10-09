package controller

import (
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestOrphanAccountVisibilityAndDeletionGuard(t *testing.T) {
	_ = newRoleTestEngine(t)
	db := database.GetDB()
	rec := model.ClientRecord{Email: "real-subscription", SubID: "keep-subscription", UUID: "keep-node-credential"}
	if err := db.Create(&rec).Error; err != nil {
		t.Fatal(err)
	}
	missingID := 999999
	users := []model.User{
		{Username: "real-customer", Role: model.RoleCustomer, ClientID: &rec.Id},
		{Username: "user1", Role: model.RoleCustomer, ClientID: &missingID},
		{Username: "unbound", Role: model.RoleCustomer},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	svc := &panel.UserService{}
	listed, err := svc.ListPanelUsers()
	if err != nil {
		t.Fatal(err)
	}
	statuses := map[string]string{}
	for _, row := range listed {
		statuses[row.Username] = row.SubscriptionStatus
	}
	for name, status := range map[string]string{"real-customer": "linked", "user1": "missing", "unbound": "unbound"} {
		if statuses[name] != status {
			t.Fatalf("%s: status %q, want %q", name, statuses[name], status)
		}
	}
	if err := svc.DeleteOrphanSubscriber(users[0].Id, 0); err == nil {
		t.Fatal("orphan action deleted an active customer's login")
	}
	admin, err := svc.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteOrphanSubscriber(admin.Id, 0); err == nil {
		t.Fatal("orphan action deleted an administrator")
	}
	// A binding may be restored after the list was displayed.
	restored := model.ClientRecord{Email: "restored-subscription"}
	if err := db.Create(&restored).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&users[1]).Update("client_id", restored.Id).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteOrphanSubscriber(users[1].Id, 0); err == nil {
		t.Fatal("orphan action deleted a login after its binding was restored")
	}
	if err := svc.DeleteOrphanSubscriber(users[2].Id, 0); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.User{}).Where("id = ?", users[2].Id).Count(&count)
	if count != 0 {
		t.Fatal("unbound login was not removed")
	}
	var after model.ClientRecord
	if err := db.First(&after, rec.Id).Error; err != nil || after.SubID != rec.SubID || after.UUID != rec.UUID {
		t.Fatal("orphan deletion changed an unrelated subscription")
	}
}
