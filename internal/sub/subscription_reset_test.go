package sub

import (
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func TestSubscriptionResetRevokesOldLinks(t *testing.T) {
	seedSubDB(t)
	seedSubInbound(t, "reset-old", "reset-node", 8443, 0, wsTLSStream)
	before, _, _, _, err := NewSubService("").GetSubs("reset-old", "example.com")
	if err != nil || len(before) == 0 {
		t.Fatalf("original subscription: %v %v", before, err)
	}
	var rec model.ClientRecord
	if err := database.GetDB().Where("sub_id = ?", "reset-old").First(&rec).Error; err != nil {
		t.Fatal(err)
	}
	token, err := (&service.ClientService{}).ResetSubscription(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	old, _, _, _, err := NewSubService("").GetSubs("reset-old", "example.com")
	if err != nil || len(old) != 0 {
		t.Fatalf("old subscription still available: %v %v", old, err)
	}
	after, _, _, _, err := NewSubService("").GetSubs(token, "example.com")
	if err != nil || len(after) != len(before) {
		t.Fatalf("new subscription: %v %v", after, err)
	}
	for i := range before {
		if before[i] != after[i] {
			t.Fatal("reset changed proxy configuration")
		}
	}
}
