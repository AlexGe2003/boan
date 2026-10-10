package service

import (
	"encoding/json"
	"net/netip"
	"time"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func clientConnectionNode(guid string) (ClientConnection, bool, error) {
	self, err := (&SettingService{}).GetPanelGuid()
	if err != nil {
		return ClientConnection{}, false, err
	}
	if guid == self {
		return ClientConnection{NodeName: "本机"}, true, nil
	}
	var nodes []*model.Node
	if err := database.GetDB().Find(&nodes).Error; err != nil {
		return ClientConnection{}, false, err
	}
	ambiguous := ambiguousNodeGuids(nodes, self)
	for _, node := range nodes {
		if effectiveNodeGuid(node, ambiguous) == guid {
			return ClientConnection{NodeID: node.Id, NodeName: node.Name}, true, nil
		}
	}
	return ClientConnection{}, false, nil
}

func recordLastClientConnection(tx *gorm.DB, email string, source ClientConnection, entries []model.ClientIpEntry) error {
	now := time.Now().Unix()
	for _, entry := range entries {
		ip, err := netip.ParseAddr(entry.IP)
		if err != nil || ip.Unmap().IsLoopback() || ip.IsUnspecified() || entry.Timestamp <= 0 || entry.Timestamp > now {
			continue
		}
		if seen := entry.Timestamp * 1000; seen > source.LastSeen {
			source.IP, source.LastSeen = MaskDeviceIP(ip.Unmap().String()), seen
		}
	}
	if source.LastSeen == 0 {
		return nil
	}
	encoded, err := json.Marshal(source)
	if err != nil {
		return err
	}
	return tx.Model(&model.ClientRecord{}).
		Where("email = ? AND last_connection_at < ?", email, source.LastSeen).
		UpdateColumns(map[string]any{"last_connection": string(encoded), "last_connection_at": source.LastSeen}).Error
}
