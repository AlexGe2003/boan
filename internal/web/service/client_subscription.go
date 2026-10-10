package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// ResetSubscription rotates only the subscription token, preserving proxy credentials and usage.
func (s *ClientService) ResetSubscription(id int) (string, error) {
	token := uuid.NewString()
	err := runSerializedTx(func(tx *gorm.DB) error {
		var rec model.ClientRecord
		if err := tx.First(&rec, id).Error; err != nil {
			return err
		}
		if rec.SubID != "" {
			var sharing int64
			if err := tx.Model(&model.ClientRecord{}).Where("sub_id = ? AND id <> ?", rec.SubID, id).Count(&sharing).Error; err != nil {
				return err
			}
			if sharing > 0 {
				return errors.New("订阅标识被多个用户共用，请先由管理员分配独立订阅标识")
			}
		}
		var inbounds []model.Inbound
		if err := tx.Where("id IN (?)", tx.Model(&model.ClientInbound{}).Select("inbound_id").Where("client_id = ?", id)).Find(&inbounds).Error; err != nil {
			return err
		}
		for _, inbound := range inbounds {
			var settings map[string]json.RawMessage
			if err := json.Unmarshal([]byte(inbound.Settings), &settings); err != nil {
				return err
			}
			if raw, ok := settings["clients"]; ok {
				var clients []map[string]json.RawMessage
				if err := json.Unmarshal(raw, &clients); err != nil {
					return err
				}
				changed := false
				for _, client := range clients {
					var email string
					if err := json.Unmarshal(client["email"], &email); err != nil {
						return err
					}
					if strings.TrimSpace(email) == rec.Email {
						client["subId"], _ = json.Marshal(token)
						changed = true
					}
				}
				if changed {
					settings["clients"], _ = json.Marshal(clients)
					encoded, err := json.Marshal(settings)
					if err != nil {
						return err
					}
					if err := tx.Model(&model.Inbound{}).Where("id = ?", inbound.Id).Update("settings", string(encoded)).Error; err != nil {
						return err
					}
				}
			}
			if inbound.NodeID != nil {
				if err := (&NodeService{}).MarkNodeDirtyTx(tx, *inbound.NodeID); err != nil {
					return err
				}
			}
		}
		if rec.SubID != "" {
			if err := tx.Model(&model.ClientHwid{}).Where("sub_id = ?", rec.SubID).Update("sub_id", token).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.ClientRecord{}).Where("id = ?", id).Update("sub_id", token).Error
	})
	if err != nil {
		return "", err
	}
	return token, nil
}
