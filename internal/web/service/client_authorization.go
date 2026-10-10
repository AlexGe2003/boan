package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// Authorization secrets are returned once; the database stores only their hashes.
func (s *ClientService) IssueSubscriptionAuthorization(email, name string, replaceID int) (int, string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 60 || replaceID < 0 {
		return 0, "", errors.New("请输入 1–60 个字符的授权名称")
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return 0, "", err
	}
	token := hex.EncodeToString(secret)
	var id int
	err := runSerializedTx(func(tx *gorm.DB) error {
		var client model.ClientRecord
		q := tx.Where("email = ?", email)
		if tx.Name() == "postgres" {
			q = q.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := q.First(&client).Error; err != nil {
			return err
		}
		if !client.Enable || client.SubID == "" {
			return errors.New("订阅不可用")
		}
		var sharing int64
		if err := tx.Model(&model.ClientRecord{}).Where("sub_id = ?", client.SubID).Count(&sharing).Error; err != nil {
			return err
		}
		if sharing != 1 {
			return errors.New("共享订阅请联系管理员")
		}
		if err := tx.Model(&client).Update("subscription_authorization_required", true).Error; err != nil {
			return err
		}
		if replaceID > 0 {
			result := tx.Model(&model.ClientHwid{}).Where("id = ? AND sub_id = ?", replaceID, client.SubID).Updates(map[string]any{"authorization": true, "hwid_hash": hashHwid(token), "device_model": name, "last_seen": 0, "user_agent": "", "last_ip": ""})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return errors.New("授权不存在")
			}
			id = replaceID
			return nil
		}
		limit, err := effectiveHwidLimitForSubID(tx, client.SubID)
		if err != nil {
			return err
		}
		if limit <= 0 {
			limit = 3
		}
		var count int64
		if err := tx.Model(&model.ClientHwid{}).Where("sub_id = ?", client.SubID).Count(&count).Error; err != nil {
			return err
		}
		if count >= int64(limit) {
			return errors.New("授权名额已满，请先撤销一个名额")
		}
		row := model.ClientHwid{SubID: client.SubID, HwidHash: hashHwid(token), Authorization: true, DeviceModel: name, FirstSeen: time.Now().UnixMilli()}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		id = row.Id
		return nil
	})
	if err != nil {
		return 0, "", err
	}
	return id, token, nil
}

func (s *ClientService) ValidateSubscriptionAuthorization(subID, token string, req HwidRequest) (bool, error) {
	if len(token) != 64 {
		return false, nil
	}
	if _, err := hex.DecodeString(token); err != nil {
		return false, nil
	}
	req = normalizeHwidRequest(req)
	result := database.GetDB().Model(&model.ClientHwid{}).Where("sub_id = ? AND hwid_hash = ? AND authorization = ?", subID, hashHwid(token), true).Updates(map[string]any{"last_seen": time.Now().UnixMilli(), "user_agent": req.UserAgent, "last_ip": req.SourceIP})
	return result.RowsAffected == 1, result.Error
}
