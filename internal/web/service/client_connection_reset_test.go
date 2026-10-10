package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

type credentialResetRuntime struct {
	fakeNodeRuntime
	t    *testing.T
	fail bool
}

func (r *credentialResetRuntime) UpdateUser(ctx context.Context, ib *model.Inbound, email string, payload model.Client) error {
	var stored model.ClientRecord
	if err := database.GetDB().Where("email = ?", email).First(&stored).Error; err != nil {
		return err
	}
	if payload.ID != stored.UUID || payload.Password != stored.Password || payload.SubID != stored.SubID {
		r.t.Error("runtime received credentials inconsistent with the committed record")
	}
	if r.fail {
		return errors.New("test node unavailable")
	}
	return r.fakeNodeRuntime.UpdateUser(ctx, ib, email, payload)
}

func seedCredentialReset(t *testing.T, protocols ...model.Protocol) (model.ClientRecord, *credentialResetRuntime) {
	t.Helper()
	setupBulkDB(t)
	db := database.GetDB()
	mgr := useTestRuntimeManager(t)
	rt := &credentialResetRuntime{t: t}
	rec := model.ClientRecord{Email: "reset-access", SubID: "old-subscription", UUID: "old-uuid", Password: "old-password", TotalGB: 12345, ExpiryTime: 987654, LimitIP: 3, Enable: true}
	if err := db.Create(&rec).Error; err != nil {
		t.Fatal(err)
	}
	for i, protocol := range protocols {
		node := model.Node{Id: i + 1, Name: string(protocol), Address: "example.test", Enable: true}
		seedNodeRow(t, db, &node)
		mgr.SetRuntimeOverride(node.Id, rt)
		ib := model.Inbound{Tag: string(protocol), Port: 12000 + i, NodeID: &node.Id, Protocol: protocol, Settings: `{"clients":[{"email":"reset-access","id":"old-uuid","password":"old-password","subId":"old-subscription","custom":123},{"email":"other","id":"keep","password":"keep","subId":"keep"}]}`}
		if err := db.Create(&ib).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: ib.Id}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.ClientHwid{SubID: rec.SubID, HwidHash: "old-grant", Authorization: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ServerClientUsage{Email: rec.Email, Up: 123, Down: 456}).Error; err != nil {
		t.Fatal(err)
	}
	return rec, rt
}

func TestResetConnectionAccessRotatesEveryNodeAndPreservesBenefits(t *testing.T) {
	rec, rt := seedCredentialReset(t, model.VLESS, model.VMESS, model.Trojan)
	token, err := (&ClientService{}).ResetConnectionAccess(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	var stored model.ClientRecord
	db := database.GetDB()
	if err := db.First(&stored, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.SubID != token || stored.SubID == rec.SubID || stored.UUID == rec.UUID || stored.Password == rec.Password || stored.TotalGB != rec.TotalGB || stored.ExpiryTime != rec.ExpiryTime || stored.LimitIP != 3 || !stored.Enable {
		t.Fatal("credentials were not rotated or account benefits changed")
	}
	var inbounds []model.Inbound
	if err := db.Find(&inbounds).Error; err != nil {
		t.Fatal(err)
	}
	for _, ib := range inbounds {
		var settings struct{ Clients []map[string]any }
		if err := json.Unmarshal([]byte(ib.Settings), &settings); err != nil {
			t.Fatal(err)
		}
		own, other := settings.Clients[0], settings.Clients[1]
		if own["subId"] != token || own["custom"] != float64(123) || other["id"] != "keep" || other["subId"] != "keep" {
			t.Fatal("inbound metadata or another client changed")
		}
		if ib.Protocol == model.Trojan && own["password"] != stored.Password {
			t.Fatal("Trojan password not rotated")
		}
		if ib.Protocol != model.Trojan && own["id"] != stored.UUID {
			t.Fatal("UUID not rotated")
		}
	}
	var grants int64
	if err := db.Model(&model.ClientHwid{}).Where("sub_id = ?", rec.SubID).Count(&grants).Error; err != nil {
		t.Fatal(err)
	}
	if grants != 0 || rt.updateUser.Load() != 3 {
		t.Fatal("old grants remain or not all runtimes updated")
	}
	traffic, err := (&ClientService{}).DeviceTraffic(rec.Email)
	if err != nil || traffic.Total != 579 {
		t.Fatalf("usage changed: %+v, %v", traffic, err)
	}
}

func TestResetConnectionAccessRejectsUnsupportedProtocolAtomically(t *testing.T) {
	rec, rt := seedCredentialReset(t, model.VLESS, model.Shadowsocks)
	if _, err := (&ClientService{}).ResetConnectionAccess(rec.Id); err == nil {
		t.Fatal("unsupported protocol accepted")
	}
	var stored model.ClientRecord
	if err := database.GetDB().First(&stored, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.SubID != rec.SubID || stored.UUID != rec.UUID || stored.Password != rec.Password || rt.updateUser.Load() != 0 {
		t.Fatal("rejected rotation partially applied")
	}
}

func TestResetConnectionAccessReportsRuntimeFailureAfterPersistingRotation(t *testing.T) {
	rec, rt := seedCredentialReset(t, model.VLESS)
	rt.fail = true
	if _, err := (&ClientService{}).ResetConnectionAccess(rec.Id); err == nil || !strings.Contains(err.Error(), "部分节点同步失败") {
		t.Fatalf("sync failure not reported: %v", err)
	}
	var stored model.ClientRecord
	if err := database.GetDB().First(&stored, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.UUID == rec.UUID || stored.SubID == rec.SubID {
		t.Fatal("rotation falsely reported without persisting new credentials")
	}
}

func TestResetConnectionAccessRejectsExternalNodesWithoutPartialRotation(t *testing.T) {
	rec, rt := seedCredentialReset(t, model.VLESS)
	db := database.GetDB()
	if err := db.Create(&model.ClientExternalLink{ClientId: rec.Id, Kind: model.ExternalLinkKindLink, Value: "vless://external@example.test:443"}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := (&ClientService{}).ResetConnectionAccess(rec.Id); err == nil || !strings.Contains(err.Error(), "外部节点") {
		t.Fatalf("external credentials falsely accepted for revocation: %v", err)
	}
	var stored model.ClientRecord
	if err := db.First(&stored, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.UUID != rec.UUID || stored.SubID != rec.SubID || rt.updateUser.Load() != 0 {
		t.Fatal("external-node rejection partially reset the account")
	}
}
