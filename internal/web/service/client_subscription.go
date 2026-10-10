package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

var subscriptionResetMu sync.Mutex

// ResetSubscription rotates only the subscription token, preserving proxy credentials and usage.
func (s *ClientService) ResetSubscription(id int) (string, error) {
	return s.resetSubscription(id, false)
}

func (s *ClientService) ResetConnectionAccess(id int) (string, error) {
	return s.resetSubscription(id, true)
}

func (s *ClientService) resetSubscription(id int, resetConnections bool) (string, error) {
	subscriptionResetMu.Lock()
	defer subscriptionResetMu.Unlock()
	token := uuid.NewString()
	newID, password := uuid.NewString(), uuid.NewString()
	var applies []inboundApply
	err := runSerializedTx(func(tx *gorm.DB) error {
		var rec model.ClientRecord
		if err := tx.First(&rec, id).Error; err != nil {
			return err
		}
		if resetConnections && rec.Reverse != "" {
			return errors.New("反向代理账号暂不支持此操作，未更改任何凭据")
		}
		if resetConnections {
			var external int64
			if err := tx.Model(&model.ClientExternalLink{}).Where("client_id = ?", id).Count(&external).Error; err != nil {
				return err
			}
			if external > 0 {
				return errors.New("账号包含外部节点，无法在本面板更换其连接凭据；请联系管理员，未更改任何凭据")
			}
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
			if resetConnections {
				switch inbound.Protocol {
				case model.VLESS, model.VMESS, model.Trojan:
				default:
					return errors.New("连接凭据重置目前仅支持 VLESS、VMess 和 Trojan；未更改任何凭据")
				}
			}
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
						if resetConnections {
							switch inbound.Protocol {
							case model.VLESS, model.VMESS:
								client["id"], _ = json.Marshal(newID)
							case model.Trojan:
								client["password"], _ = json.Marshal(password)
							}
						}
						changed = true
					}
				}
				if resetConnections && !changed {
					return errors.New("节点配置缺少此账号，未更改任何凭据；请联系管理员修复关联")
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
			} else if resetConnections {
				return errors.New("节点配置缺少客户端列表，未更改任何凭据")
			}
			if resetConnections {
				mgr := runtime.GetManager()
				if mgr == nil {
					return errors.New("节点运行管理器不可用，未更改任何凭据")
				}
				rt, err := mgr.RuntimeFor(inbound.NodeID)
				if err != nil {
					return err
				}
				payload := *rec.ToClient()
				payload.ID, payload.Password, payload.SubID = newID, password, token
				applies = append(applies, inboundApply{id: inbound.Id, run: func() (bool, error) {
					ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
					defer cancel()
					return false, rt.UpdateUser(ctx, &inbound, rec.Email, clientWithInboundFlow(payload, &inbound))
				}})
			}
			if inbound.NodeID != nil {
				if err := (&NodeService{}).MarkNodeDirtyTx(tx, *inbound.NodeID); err != nil {
					return err
				}
			}
		}
		if rec.SubID != "" && resetConnections {
			if err := tx.Where("sub_id = ?", rec.SubID).Delete(&model.ClientHwid{}).Error; err != nil {
				return err
			}
		} else if rec.SubID != "" {
			if err := tx.Model(&model.ClientHwid{}).Where("sub_id = ?", rec.SubID).Update("sub_id", token).Error; err != nil {
				return err
			}
		}
		updates := map[string]any{"sub_id": token}
		if resetConnections {
			updates["uuid"], updates["password"] = newID, password
			updates["subscription_authorization_required"] = false
		}
		return tx.Model(&model.ClientRecord{}).Where("id = ?", id).Updates(updates).Error
	})
	if err != nil {
		return "", err
	}
	if _, err := fanoutInboundApplies(applies); err != nil {
		return "", errors.New("连接凭据已重置，但部分节点同步失败；请刷新订阅获取新配置，并联系管理员确认节点同步完成")
	}
	return token, nil
}
