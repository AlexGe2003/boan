package cluster

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/crypto/nodetoken"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

type Snapshot struct {
	Schema       string                      `json:"schema"`
	Tables       map[string][]map[string]any `json:"tables"`
	AuthSettings []model.Setting             `json:"authSettings"`
}

// Explicit allowlist: never import API tokens, machine settings or cluster state.
var tables = []string{"users", "panel_role_definitions", "subscription_plans", "node_groups", "service_orders", "support_tickets", "support_messages", "subscription_assignments", "inbounds", "client_traffics", "inbound_client_ips", "history_of_seeders", "nodes", "clients", "client_inbounds", "client_hwids", "client_external_links", "client_groups", "inbound_fallbacks", "hosts", "node_client_traffics", "server_client_usages", "server_usage_billings", "server_usage_controls", "node_group_buy_configs", "node_client_ips", "client_global_traffics", "sub_balancers"}

func Capture(db *gorm.DB) (*Snapshot, error) {
	s := &Snapshot{Tables: map[string][]map[string]any{}}
	schema, err := schemaSignature(db)
	if err != nil {
		return nil, err
	}
	s.Schema = schema
	for _, table := range tables {
		if !db.Migrator().HasTable(table) {
			return nil, fmt.Errorf("missing handoff table %s", table)
		}
		var rows []map[string]any
		if err := db.Table(table).Find(&rows).Error; err != nil {
			return nil, err
		}
		// Normalize driver []byte values and preserve integers across transport.
		for _, row := range rows {
			for k, v := range row {
				if b, ok := v.([]byte); ok {
					row[k] = string(b)
				}
			}
		}
		s.Tables[table] = rows
	}
	if err := db.Where("key LIKE ? OR key LIKE ?", "twoFactor%", "ldap%").Find(&s.AuthSettings).Error; err != nil {
		return nil, err
	}
	for _, row := range s.Tables["nodes"] {
		token, err := nodetoken.Decrypt(integer(row["id"]), str(row["api_token"]))
		if err != nil {
			return nil, err
		}
		row["api_token"] = token
	}
	return s, nil
}
func integer(v any) int { return int(number64(v)) }
func number64(v any) int64 {
	switch n := v.(type) {
	case int:
		return int64(n)
	case int64:
		return n
	case float64:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}
func str(v any) string { s, _ := v.(string); return s }

// Rebase preserves business IDs and changes only physical node placement.
func (s *Snapshot) Rebase(oldSelf, target Peer, local []model.Inbound) error {
	targetID := target.Node.Id
	if targetID <= 0 {
		return errors.New("target must be a direct registered node")
	}
	byTag := map[string]model.Inbound{}
	for _, ib := range local {
		byTag[ib.Tag] = ib
	}
	seen := map[string]bool{}
	for _, row := range s.Tables["inbounds"] {
		id := integer(row["node_id"])
		tag := str(row["tag"])
		switch id {
		case 0:
			row["node_id"] = targetID
			row["origin_node_guid"] = oldSelf.Node.Guid
			row["tag"] = fmt.Sprintf("n%d-%s", targetID, tag)
		case targetID:
			ib, ok := byTag[tag]
			if !ok {
				ib, ok = byTag[strings.TrimPrefix(tag, fmt.Sprintf("n%d-", targetID))]
			}
			if !ok {
				return fmt.Errorf("target inbound %s has not finished synchronizing", tag)
			}
			// Do not replace a local dataplane configuration with a stale mirror.
			if !equivalentJSON(str(row["settings"]), ib.Settings) || integer(row["port"]) != ib.Port || str(row["protocol"]) != string(ib.Protocol) || !equivalentJSON(str(row["stream_settings"]), ib.StreamSettings) {
				return fmt.Errorf("target inbound %s differs from primary; synchronize before switching", tag)
			}
			row["node_id"] = nil
			row["origin_node_guid"] = ""
			row["tag"] = ib.Tag
			seen[ib.Tag] = true
		}
	}
	if len(seen) != len(local) {
		return errors.New("target has local inbounds missing from primary")
	}
	tags := map[string]bool{}
	for _, row := range s.Tables["inbounds"] {
		tag := str(row["tag"])
		if tags[tag] {
			return fmt.Errorf("handoff creates duplicate inbound tag %s", tag)
		}
		tags[tag] = true
	}
	// Swap the target node row for the former primary at the same ID. Other
	// node/inbound IDs remain stable, including plan and order references.
	for _, row := range s.Tables["nodes"] {
		if integer(row["id"]) == targetID {
			n := oldSelf.Node
			row["name"] = n.Name
			row["address"] = n.Address
			row["scheme"] = n.Scheme
			row["port"] = n.Port
			row["base_path"] = n.BasePath
			row["guid"] = n.Guid
			row["api_token"] = oldSelf.Token
			row["tls_verify_mode"] = n.TlsVerifyMode
			row["pinned_cert_sha256"] = n.PinnedCertSha256
			row["allow_private_address"] = n.AllowPrivateAddress
			row["inbound_sync_mode"] = "all"
			row["inbound_tags"] = "null"
			row["outbound_tag"] = ""
			row["inbounds_adopted_at"] = 0
		}
	}
	// Usage policy and billing are physical-node data; swap local and target IDs.
	for _, table := range []string{"server_client_usages", "server_usage_billings", "server_usage_controls", "node_group_buy_configs"} {
		for _, row := range s.Tables[table] {
			switch integer(row["node_id"]) {
			case 0:
				row["node_id"] = targetID
			case targetID:
				row["node_id"] = 0
			}
		}
	}
	// Baselines for the newly remote former primary must start at its local
	// counters, or the first poll would import its lifetime traffic a second time.
	var baseline []map[string]any
	for _, row := range s.Tables["node_client_traffics"] {
		if integer(row["node_id"]) != targetID {
			baseline = append(baseline, row)
		}
	}
	var nextID int
	for _, row := range baseline {
		if id := integer(row["id"]); id > nextID {
			nextID = id
		}
	}
	totals := map[string][2]int64{}
	// A former primary reports its previous aggregate plus new local deltas.
	// Baseline every email, including clients whose canonical inbound is remote.
	for _, row := range s.Tables["client_traffics"] {
		totals[str(row["email"])] = [2]int64{number64(row["up"]), number64(row["down"])}
	}
	for email, v := range totals {
		nextID++
		baseline = append(baseline, map[string]any{"id": nextID, "node_id": targetID, "email": email, "up": v[0], "down": v[1]})
	}
	s.Tables["node_client_traffics"] = baseline
	s.Tables["client_global_traffics"] = nil
	return nil
}
func (s *Snapshot) Apply(db *gorm.DB) error {
	schema, err := schemaSignature(db)
	if err != nil {
		return err
	}
	if s.Schema != schema {
		return errors.New("snapshot schema differs from destination")
	}
	if len(s.Tables) != len(tables) {
		return errors.New("incomplete snapshot")
	}
	for _, table := range tables {
		if _, ok := s.Tables[table]; !ok {
			return fmt.Errorf("snapshot missing %s", table)
		}
	}
	var previousEpoch int64
	if err := db.Model(&model.User{}).Select("COALESCE(MAX(login_epoch),0)").Scan(&previousEpoch).Error; err != nil {
		return err
	}
	for _, row := range s.Tables["users"] {
		if epoch := number64(row["login_epoch"]); epoch > previousEpoch {
			previousEpoch = epoch
		}
	}
	for _, row := range s.Tables["users"] {
		row["login_epoch"] = previousEpoch + 1
	}
	// The transaction includes the role transition at the caller. Local API
	// credentials and machine settings are intentionally left intact.
	for i := len(tables) - 1; i >= 0; i-- {
		if err := db.Exec("DELETE FROM \"" + tables[i] + "\"").Error; err != nil {
			return err
		}
	}
	for _, table := range tables {
		for _, row := range s.Tables[table] {
			for key, value := range row {
				if number, ok := value.(json.Number); ok {
					n, err := number.Int64()
					if err != nil {
						return err
					}
					row[key] = n
				}
			}
			if table == "nodes" {
				encrypted, err := nodetoken.Encrypt(integer(row["id"]), str(row["api_token"]))
				if err != nil {
					return err
				}
				row["api_token"] = encrypted
			}
			if err := db.Table(table).Create(row).Error; err != nil {
				return fmt.Errorf("import %s: %w", table, err)
			}
		}
	}
	if err := db.Where("key LIKE ? OR key LIKE ?", "twoFactor%", "ldap%").Delete(&model.Setting{}).Error; err != nil {
		return err
	}
	for _, setting := range s.AuthSettings {
		if !strings.HasPrefix(setting.Key, "twoFactor") && !strings.HasPrefix(setting.Key, "ldap") {
			return errors.New("invalid authentication setting")
		}
		var existing model.Setting
		result := db.Where("key = ?", setting.Key).First(&existing)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			setting.Id = 0
			if err := db.Create(&setting).Error; err != nil {
				return err
			}
		} else if result.Error != nil {
			return result.Error
		} else if err := db.Model(&existing).Update("value", setting.Value).Error; err != nil {
			return err
		}
	}
	if db.Dialector.Name() == "postgres" {
		for _, table := range tables {
			if !db.Migrator().HasColumn(table, "id") {
				continue
			}
			var seq *string
			if err := db.Raw("SELECT pg_get_serial_sequence(?, 'id')", table).Scan(&seq).Error; err != nil {
				return err
			}
			if seq != nil {
				if err := db.Exec("SELECT setval(?::regclass, COALESCE((SELECT MAX(id) FROM \""+table+"\"), 1), EXISTS(SELECT 1 FROM \""+table+"\"))", *seq).Error; err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func schemaSignature(db *gorm.DB) (string, error) {
	var parts []string
	parts = append(parts, db.Dialector.Name())
	for _, table := range tables {
		cols, err := db.Migrator().ColumnTypes(table)
		if err != nil {
			return "", err
		}
		for _, col := range cols {
			parts = append(parts, table+"."+col.Name()+":"+col.DatabaseTypeName())
		}
	}
	sort.Strings(parts)
	sum := sha256.Sum256([]byte(strings.Join(parts, "\n")))
	return hex.EncodeToString(sum[:]), nil
}

func equivalentJSON(a, b string) bool {
	if a == b {
		return true
	}
	var left, right any
	leftDecoder := json.NewDecoder(strings.NewReader(a))
	leftDecoder.UseNumber()
	rightDecoder := json.NewDecoder(strings.NewReader(b))
	rightDecoder.UseNumber()
	if leftDecoder.Decode(&left) != nil || rightDecoder.Decode(&right) != nil {
		return false
	}
	return reflect.DeepEqual(left, right)
}
