package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/netip"
	"strings"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type HwidRequest struct {
	Hwid        string
	UserAgent   string
	DeviceOS    string
	OsVersion   string
	DeviceModel string
	SourceIP    string
}

type HwidGateResult struct {
	Allowed           bool
	Active            bool
	NotSupported      bool
	MaxDevicesReached bool
	LimitReached      bool
	Limit             int
	Registered        int
}

// HwidSlotStatus is the aggregate device-slot view exposed to subscribers:
// counters only, no hwid value or hash, no email, no device metadata.
type HwidSlotStatus struct {
	Active     bool `json:"active" example:"true"`
	Limit      int  `json:"limit" example:"2"`
	Registered int  `json:"registered" example:"1"`
	Remaining  int  `json:"remaining" example:"1"`
	Full       bool `json:"full" example:"false"`
}

const (
	minHwidLength         = 6
	hwidFingerprintLength = 12
)

type ClientHwidInfo struct {
	Authorization bool   `json:"authorization,omitempty"`
	ClientName    string `json:"clientName,omitempty"`
	ClientVersion string `json:"clientVersion,omitempty"`
	Id            int    `json:"id"`
	FirstSeen     int64  `json:"firstSeen"`
	LastSeen      int64  `json:"lastSeen"`
	UserAgent     string `json:"userAgent"`
	DeviceOS      string `json:"deviceOs"`
	OsVersion     string `json:"osVersion"`
	DeviceModel   string `json:"deviceModel"`
	Fingerprint   string `json:"fingerprint"`
	LastIP        string `json:"lastIp"`
}

type ClientDeviceSlots struct {
	OnlineIPLimit      int                     `json:"onlineIpLimit,omitempty"`
	SubscriptionClient *SubscriptionClientInfo `json:"subscriptionClient,omitempty"`
	Devices            []ClientHwidInfo        `json:"devices"`
	Registered         int                     `json:"registered"`
	Limit              int                     `json:"limit"`
	Remaining          int                     `json:"remaining"`
	Full               bool                    `json:"full"`
}

func (s *ClientService) DeviceSlots(email string) (ClientDeviceSlots, error) {
	rec, err := s.GetRecordByEmail(nil, email)
	if err != nil {
		return ClientDeviceSlots{}, err
	}
	devices, err := s.ListClientHwids(email)
	if err != nil {
		return ClientDeviceSlots{}, err
	}
	if devices == nil {
		devices = []ClientHwidInfo{}
	}
	subscriptionClient, err := s.subscriptionClient(rec.Id)
	if err != nil {
		return ClientDeviceSlots{}, err
	}
	limit := rec.LimitHwid
	if rec.Enable && strings.TrimSpace(rec.SubID) != "" {
		limit, err = effectiveHwidLimitForSubID(database.GetDB(), rec.SubID)
		if err != nil {
			return ClientDeviceSlots{}, err
		}
	}
	return ClientDeviceSlots{OnlineIPLimit: rec.LimitIP, SubscriptionClient: subscriptionClient, Devices: devices, Registered: len(devices), Limit: limit, Remaining: max(limit-len(devices), 0), Full: limit > 0 && len(devices) >= limit}, nil
}

func hashHwid(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func shortHwidFingerprint(hash string) string {
	if len(hash) <= hwidFingerprintLength {
		return hash
	}
	return hash[:hwidFingerprintLength]
}

func trimHwidMeta(s string) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) > 512 {
		return string(r[:512])
	}
	return s
}

func normalizeHwidRequest(req HwidRequest) HwidRequest {
	sourceIP := ""
	if ip, err := netip.ParseAddr(strings.TrimSpace(req.SourceIP)); err == nil {
		sourceIP = ip.Unmap().String()
	}
	return HwidRequest{
		Hwid:        strings.TrimSpace(req.Hwid),
		UserAgent:   trimHwidMeta(req.UserAgent),
		DeviceOS:    trimHwidMeta(req.DeviceOS),
		OsVersion:   trimHwidMeta(req.OsVersion),
		DeviceModel: trimHwidMeta(req.DeviceModel),
		SourceIP:    sourceIP,
	}
}

func effectiveHwidLimitForSubID(tx *gorm.DB, subID string) (int, error) {
	var limit int
	err := tx.Model(&model.ClientRecord{}).
		Where("sub_id = ? AND enable = ?", subID, true).
		Select("COALESCE(MAX(limit_hwid), 0)").
		Scan(&limit).Error
	return limit, err
}

func (s *ClientService) EnforceHwidForSubID(subID string, req HwidRequest) (HwidGateResult, error) {
	var res HwidGateResult
	subID = strings.TrimSpace(subID)
	if subID == "" {
		res.Allowed = true
		return res, nil
	}

	db := database.GetDB()
	var authorizationRequired int64
	if err := db.Model(&model.ClientRecord{}).Where("sub_id = ? AND enable = ? AND subscription_authorization_required = ?", subID, true, true).Count(&authorizationRequired).Error; err != nil {
		return res, err
	}
	if authorizationRequired > 0 {
		return HwidGateResult{Active: true, NotSupported: true}, nil
	}
	limit, err := effectiveHwidLimitForSubID(db, subID)
	if err != nil {
		return res, err
	}
	req = normalizeHwidRequest(req)
	if limit <= 0 {
		res.Allowed = true
		if len(req.Hwid) >= minHwidLength {
			trackUnlimitedHwid(db, subID, req)
		}
		return res, nil
	}

	res.Active = true
	res.Limit = limit
	if len(req.Hwid) < minHwidLength {
		res.NotSupported = true
		return res, nil
	}
	hwidHash := hashHwid(req.Hwid)

	err = db.Transaction(func(tx *gorm.DB) error {
		if tx.Name() == "postgres" {
			var records []model.ClientRecord
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").Where("sub_id = ?", subID).Order("id").Find(&records).Error; err != nil {
				return err
			}
		}
		limit, err := effectiveHwidLimitForSubID(tx, subID)
		if err != nil {
			return err
		}
		if limit <= 0 {
			res = HwidGateResult{Allowed: true}
			return nil
		}
		res.Active = true
		res.Limit = limit
		now := time.Now().UnixMilli()
		var existing model.ClientHwid
		err = tx.Where("sub_id = ? AND hwid_hash = ?", subID, hwidHash).First(&existing).Error
		if err == nil {
			if err := tx.Model(&model.ClientHwid{}).Where("id = ?", existing.Id).Updates(map[string]any{
				"last_seen": now, "user_agent": req.UserAgent, "device_os": req.DeviceOS, "os_version": req.OsVersion, "device_model": req.DeviceModel, "last_ip": req.SourceIP,
			}).Error; err != nil {
				return err
			}
			var count int64
			if err := tx.Model(&model.ClientHwid{}).Where("sub_id = ?", subID).Count(&count).Error; err != nil {
				return err
			}
			res.Allowed = true
			res.Registered = int(count)
			res.LimitReached = count >= int64(limit)
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var count int64
		if err := tx.Model(&model.ClientHwid{}).Where("sub_id = ?", subID).Count(&count).Error; err != nil {
			return err
		}
		res.Registered = int(count)
		if count >= int64(limit) {
			res.MaxDevicesReached = true
			res.LimitReached = true
			return nil
		}
		if err := tx.Create(&model.ClientHwid{SubID: subID, HwidHash: hwidHash, FirstSeen: now, LastSeen: now, UserAgent: req.UserAgent, DeviceOS: req.DeviceOS, OsVersion: req.OsVersion, DeviceModel: req.DeviceModel, LastIP: req.SourceIP}).Error; err != nil {
			return err
		}
		res.Allowed = true
		res.Registered = int(count) + 1
		res.LimitReached = res.Registered >= limit
		return nil
	})
	return res, err
}

// trackUnlimitedHwid lists devices of a sub with no HWID limit in the panel. It is
// best-effort: a failed write must not deny a subscription nothing restricts.
func trackUnlimitedHwid(db *gorm.DB, subID string, req HwidRequest) {
	now := time.Now().UnixMilli()
	err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "sub_id"}, {Name: "hwid_hash"}},
		DoUpdates: clause.AssignmentColumns([]string{"last_seen", "user_agent", "device_os", "os_version", "device_model", "last_ip"}),
	}).Create(&model.ClientHwid{SubID: subID, HwidHash: hashHwid(req.Hwid), FirstSeen: now, LastSeen: now, UserAgent: req.UserAgent, DeviceOS: req.DeviceOS, OsVersion: req.OsVersion, DeviceModel: req.DeviceModel, LastIP: req.SourceIP}).Error
	if err != nil {
		logger.Warning("track HWID for unlimited subscription failed:", err)
	}
}

// HwidSlotStatusForSubID is SELECT-only: it must never write client_hwids or
// last_seen. Enabled-clients scope mirrors the gate, so limit == limit enforced.
func (s *ClientService) HwidSlotStatusForSubID(subID string) (status HwidSlotStatus, found bool, err error) {
	subID = strings.TrimSpace(subID)
	if subID == "" {
		return status, false, nil
	}

	db := database.GetDB()
	var enabled int64
	if err := db.Model(&model.ClientRecord{}).
		Where("sub_id = ? AND enable = ?", subID, true).
		Count(&enabled).Error; err != nil {
		return status, false, err
	}
	if enabled == 0 {
		return status, false, nil
	}

	limit, err := effectiveHwidLimitForSubID(db, subID)
	if err != nil {
		return status, false, err
	}
	if limit <= 0 {
		return status, true, nil
	}

	var registered int64
	if err := db.Model(&model.ClientHwid{}).Where("sub_id = ?", subID).Count(&registered).Error; err != nil {
		return status, false, err
	}
	status.Active = true
	status.Limit = limit
	status.Registered = int(registered)
	status.Remaining = max(limit-status.Registered, 0)
	status.Full = status.Registered >= limit
	return status, true, nil
}

func (s *ClientService) ListClientHwids(email string) ([]ClientHwidInfo, error) {
	rec, err := s.GetRecordByEmail(nil, email)
	if err != nil {
		return nil, err
	}
	subID := strings.TrimSpace(rec.SubID)
	if subID == "" {
		return nil, nil
	}
	var rows []model.ClientHwid
	if err := database.GetDB().
		Where("sub_id = ?", subID).
		Order("last_seen DESC").
		Order("id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ClientHwidInfo, 0, len(rows))
	for _, r := range rows {
		name, version := IdentifySubscriptionClient(r.UserAgent)
		out = append(out, ClientHwidInfo{
			ClientName: name, ClientVersion: version, Authorization: r.Authorization,
			Id:          r.Id,
			FirstSeen:   r.FirstSeen,
			LastSeen:    r.LastSeen,
			UserAgent:   r.UserAgent,
			DeviceOS:    r.DeviceOS,
			OsVersion:   r.OsVersion,
			DeviceModel: r.DeviceModel,
			Fingerprint: shortHwidFingerprint(r.HwidHash),
			LastIP:      MaskDeviceIP(r.LastIP),
		})
	}
	return out, nil
}

func (s *ClientService) ClearClientHwids(email string) error {
	rec, err := s.GetRecordByEmail(nil, email)
	if err != nil {
		return err
	}
	subID := strings.TrimSpace(rec.SubID)
	if subID == "" {
		return nil
	}
	return database.GetDB().Where("sub_id = ?", subID).Delete(&model.ClientHwid{}).Error
}

// DeleteClientHwid removes one device, scoped to the client's sub_id: ids
// are a global auto-increment, so an id outside this subscription won't match.
func (s *ClientService) DeleteClientHwid(email string, id int) error {
	rec, err := s.GetRecordByEmail(nil, email)
	if err != nil {
		return err
	}
	subID := strings.TrimSpace(rec.SubID)
	if subID == "" {
		return errors.New("client has no subscription id")
	}
	res := database.GetDB().Where("sub_id = ? AND id = ?", subID, id).Delete(&model.ClientHwid{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("device not found")
	}
	return nil
}

func (s *ClientService) setClientLimitHwidByEmail(tx *gorm.DB, email string, limit int) error {
	if tx == nil {
		tx = database.GetDB()
	}
	if limit < 0 {
		limit = 0
	}
	var rec model.ClientRecord
	if err := tx.Where("email = ?", email).First(&rec).Error; err != nil {
		return err
	}
	if err := tx.Model(&model.ClientRecord{}).Where("id = ?", rec.Id).UpdateColumn("limit_hwid", limit).Error; err != nil {
		return err
	}
	// A lower limit blocks new registrations; existing bindings are removed only
	// by an explicit user or administrator action.
	return nil
}

func clearClientHwidsBySubIDTx(tx *gorm.DB, subIDs ...string) error {
	if tx == nil {
		tx = database.GetDB()
	}
	clean := make([]string, 0, len(subIDs))
	seen := map[string]struct{}{}
	for _, subID := range subIDs {
		subID = strings.TrimSpace(subID)
		if subID == "" {
			continue
		}
		if _, ok := seen[subID]; ok {
			continue
		}
		seen[subID] = struct{}{}
		clean = append(clean, subID)
	}
	for _, batch := range chunkStrings(clean, sqlInChunk) {
		if err := tx.Where("sub_id IN ?", batch).Delete(&model.ClientHwid{}).Error; err != nil {
			return err
		}
	}
	return nil
}
