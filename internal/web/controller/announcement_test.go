package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestAnnouncementLifecycle(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	svc := panel.UserService{}
	admin, err := svc.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	c1 := model.ClientRecord{Email: "cust-announcement"}
	db.Create(&c1)
	customer := model.User{Username: "cust-announcement", Role: model.RoleCustomer, ClientID: &c1.Id}
	db.Create(&customer)

	call := func(uid int, method, path, body string, want bool) json.RawMessage {
		t.Helper()
		client := roleClient(t, engine, uid)
		r, e := client.do(method, "/panel/api/announcements"+path, body)
		if e != nil {
			t.Fatal(e)
		}
		defer r.Body.Close()
		var result struct {
			Success bool
			Obj     json.RawMessage
			Msg     string
		}
		if r.StatusCode != http.StatusOK {
			if want {
				t.Fatalf("%s %s: unexpected status %d", method, path, r.StatusCode)
			}
			return nil
		}
		if e = json.NewDecoder(r.Body).Decode(&result); e != nil {
			t.Fatal(e)
		}
		if result.Success != want {
			t.Fatalf("%s %s: want %v, got %v (%s)", method, path, want, result.Success, result.Msg)
		}
		return result.Obj
	}

	// 1. Customer cannot create announcement (forbidden)
	call(customer.Id, http.MethodPost, "", `{"title":"Hacked","content":"Nope"}`, false)

	// 2. Admin creates announcement
	obj := call(admin.Id, http.MethodPost, "", `{"title":"Maintenance Notice","content":"Network upgrade at midnight","tag":"maintenance","popup":true,"pinned":true}`, true)
	var created model.Announcement
	if err := json.Unmarshal(obj, &created); err != nil {
		t.Fatal(err)
	}
	if created.ID <= 0 || created.Title != "Maintenance Notice" || !created.Popup || !created.Pinned {
		t.Fatalf("unexpected announcement state: %+v", created)
	}

	// 3. Customer lists announcements (should see the enabled one)
	custObj := call(customer.Id, http.MethodGet, "", "", true)
	var list []model.Announcement
	if err := json.Unmarshal(custObj, &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Fatalf("customer expected 1 announcement, got %d", len(list))
	}

	// 4. Admin updates announcement
	updatePath := fmt.Sprintf("/%d", created.ID)
	call(admin.Id, http.MethodPut, updatePath, `{"title":"Updated Notice","popup":false}`, true)

	// 5. Customer cannot delete announcement
	call(customer.Id, http.MethodDelete, updatePath, "", false)

	// 6. Admin deletes announcement
	call(admin.Id, http.MethodDelete, updatePath, "", true)

	// 7. Verify list is now empty
	emptyObj := call(customer.Id, http.MethodGet, "", "", true)
	var emptyList []model.Announcement
	json.Unmarshal(emptyObj, &emptyList)
	if len(emptyList) != 0 {
		t.Fatalf("expected empty list, got %d", len(emptyList))
	}
}
