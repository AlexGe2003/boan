package service

import (
	"fmt"
	"sync"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestSubscriptionAuthorizationQuotaRotationAndRevocation(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 3)
	s := &ClientService{}
	var id int
	var token string
	for i := 0; i < 3; i++ {
		var err error
		id, token, err = s.IssueSubscriptionAuthorization(rec.Email, fmt.Sprintf("device-%d", i), 0)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := s.IssueSubscriptionAuthorization(rec.Email, "fourth", 0); err == nil {
		t.Fatal("fourth authorization accepted")
	}
	var row model.ClientHwid
	database.GetDB().First(&row, id)
	if row.HwidHash == token || !row.Authorization {
		t.Fatal("secret stored or authorization missing")
	}
	for _, ua := range []string{"Clash Verge/2.5.7", "ClashMetaForAndroid/2.11.7"} {
		ok, err := s.ValidateSubscriptionAuthorization(rec.SubID, token, HwidRequest{UserAgent: ua})
		if !ok || err != nil {
			t.Fatal(ok, err)
		}
	}
	if ok, _ := s.ValidateSubscriptionAuthorization("another-sub", token, HwidRequest{}); ok {
		t.Fatal("cross subscription authorization")
	}
	other := model.ClientRecord{Email: "another-account", SubID: "another-sub", Enable: true, LimitHwid: 3}
	database.GetDB().Create(&other)
	if _, _, err := s.IssueSubscriptionAuthorization(other.Email, "stolen", id); err == nil {
		t.Fatal("cross-account rotation")
	}
	_, rotated, err := s.IssueSubscriptionAuthorization(rec.Email, "renamed", id)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.ValidateSubscriptionAuthorization(rec.SubID, token, HwidRequest{}); ok {
		t.Fatal("old token survived rotation")
	}
	if ok, _ := s.ValidateSubscriptionAuthorization(rec.SubID, rotated, HwidRequest{}); !ok {
		t.Fatal("rotated token rejected")
	}
	if err := s.DeleteClientHwid(rec.Email, id); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.ValidateSubscriptionAuthorization(rec.SubID, rotated, HwidRequest{}); ok {
		t.Fatal("revoked token accepted")
	}
	if _, _, err := s.IssueSubscriptionAuthorization(rec.Email, "replacement", 0); err != nil {
		t.Fatal(err)
	}
	slots, err := s.DeviceSlots(rec.Email)
	if err != nil || slots.Registered != 3 {
		t.Fatal(slots, err)
	}
}

func TestConcurrentSubscriptionAuthorizationsShareDeviceQuota(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 3)
	s := &ClientService{}
	if r, err := s.EnforceHwidForSubID(rec.SubID, HwidRequest{Hwid: "existing-device"}); err != nil || !r.Allowed {
		t.Fatal(r, err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _, _ = s.IssueSubscriptionAuthorization(rec.Email, "parallel", 0) }()
	}
	wg.Wait()
	slots, err := s.DeviceSlots(rec.Email)
	if err != nil || slots.Registered != 3 {
		t.Fatal(slots, err)
	}
}
