package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/web/cluster"
	"github.com/mhsanaei/3x-ui/v3/internal/web/entity"
)

// Account security and ordinary panel preferences remain editable. Connection
// settings belong to the enrolled topology and cannot change on just one site.
func (s *SettingService) validateClusterSettings(next *entity.AllSetting) error {
	state, err := cluster.Load(database.GetDB())
	if err != nil {
		return err
	}
	if state == nil {
		return nil
	}
	if next.TgBotEnable || next.DiscordBotEnable || next.LdapEnable {
		return errors.New("集群模式暂不支持独立的 Telegram、Discord 或 LDAP 管理入口")
	}
	current, err := s.GetAllSetting()
	if err != nil {
		return err
	}
	before, err := settingFields(current)
	if err != nil {
		return err
	}
	after, err := settingFields(next)
	if err != nil {
		return err
	}
	for _, key := range []string{"webListen", "webDomain", "webPort", "webCertFile", "webKeyFile", "webBasePath", "subListen", "subDomain", "subPort", "subCertFile", "subKeyFile", "subEnable", "subPath", "subJsonPath", "subClashPath", "subJsonEnable", "subClashEnable", "panelOutbound"} {
		if !bytes.Equal(before[key], after[key]) {
			return fmt.Errorf("%s 属于集群连接配置，不能单独修改", key)
		}
	}
	return nil
}
func settingFields(s *entity.AllSetting) (map[string]json.RawMessage, error) {
	raw, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	err = json.Unmarshal(raw, &fields)
	return fields, err
}
