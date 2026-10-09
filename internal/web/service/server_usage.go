package service

import (
	"database/sql"
	"errors"
	"sort"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func recordServerUsage(tx *gorm.DB, nodeID int, email string, up, down int64) error {
	up, down = max(up, 0), max(down, 0)
	if up == 0 && down == 0 {
		return nil
	}
	if err := tx.Model(&xray.ClientTraffic{}).Where("email = ?", email).Updates(map[string]any{
		"raw_up":    gorm.Expr(database.ClampedAddExpr("raw_up"), up),
		"raw_down":  gorm.Expr(database.ClampedAddExpr("raw_down"), down),
		"raw_known": true,
	}).Error; err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	if err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "node_id"}, {Name: "email"}},
		DoUpdates: clause.Assignments(map[string]any{
			"up":         gorm.Expr(database.ClampedAddExpr("server_client_usages.up"), up),
			"down":       gorm.Expr(database.ClampedAddExpr("server_client_usages.down"), down),
			"updated_at": now,
			"started_at": gorm.Expr("CASE WHEN server_client_usages.started_at = 0 THEN ? ELSE server_client_usages.started_at END", now),
		}),
	}).Create(&model.ServerClientUsage{NodeId: nodeID, Email: email, Up: up, Down: down, StartedAt: now, UpdatedAt: now}).Error; err != nil {
		return err
	}
	return recordClientUsageHour(tx, nodeID, email, up, down, time.UnixMilli(now))
}

type ServerUsageSummary struct {
	Unattributed int64 `json:"unattributed" example:"0"`

	Recorded   int64   `json:"recorded" example:"3221225472"`
	Adjustment int64   `json:"adjustment" example:"1073741824"`
	Quota      int64   `json:"quota" example:"107374182400"`
	QuotaBasis string  `json:"quotaBasis" example:"proxy"`
	QuotaUsed  float64 `json:"quotaUsed" example:"4294967296"`
	Remaining  float64 `json:"remaining" example:"103079215104"`
	Exceeded   bool    `json:"exceeded" example:"false"`

	BillingMultiplier int     `json:"billingMultiplier" example:"2"`
	Billable          float64 `json:"billable" example:"6442450944"`
	BillingShare      float64 `json:"billingShare" example:"75"`
	NodeId            int     `json:"nodeId" example:"1"`
	Name              string  `json:"name" example:"香港节点"`
	Local             bool    `json:"local" example:"false"`
	Up                int64   `json:"up" example:"1073741824"`
	Down              int64   `json:"down" example:"2147483648"`
	Used              int64   `json:"used" example:"3221225472"`
	Share             float64 `json:"share" example:"60"`
	Users             int     `json:"users" example:"3"`
	StartedAt         int64   `json:"startedAt" example:"1790800000000"`
	UpdatedAt         int64   `json:"updatedAt" example:"1790800500000"`
}
type ServerUsageUser struct {
	Recorded   int64   `json:"recorded" example:"3221225472"`
	Adjustment int64   `json:"adjustment" example:"1073741824"`
	Quota      int64   `json:"quota" example:"107374182400"`
	QuotaBasis string  `json:"quotaBasis" example:"proxy"`
	QuotaUsed  float64 `json:"quotaUsed" example:"4294967296"`
	Remaining  float64 `json:"remaining" example:"103079215104"`
	Exceeded   bool    `json:"exceeded" example:"false"`

	Billable  float64 `json:"billable" example:"6442450944"`
	Email     string  `json:"email" example:"alice"`
	Username  string  `json:"username" example:"alice"`
	Up        int64   `json:"up" example:"1073741824"`
	Down      int64   `json:"down" example:"2147483648"`
	Used      int64   `json:"used" example:"3221225472"`
	Share     float64 `json:"share" example:"60"`
	StartedAt int64   `json:"startedAt" example:"1790800000000"`
	UpdatedAt int64   `json:"updatedAt" example:"1790800500000"`
}
type ServerUsageReport struct {
	BillableTotal float64              `json:"billableTotal" example:"10737418240"`
	Servers       []ServerUsageSummary `json:"servers"`
	Users         []ServerUsageUser    `json:"users"`
	Total         int64                `json:"total" example:"5368709120"`
	UserCount     int                  `json:"userCount" example:"3"`
	Truncated     bool                 `json:"truncated" example:"false"`
	GeneratedAt   int64                `json:"generatedAt" example:"1790800500000"`
}

type ServerUsageBillingRequest struct {
	NodeId     int `json:"nodeId" example:"1"`
	Multiplier int `json:"multiplier" example:"2"`
}

func (s *NodeService) SetUsageBilling(request ServerUsageBillingRequest) error {
	if request.NodeId < 0 || (request.Multiplier != 1 && request.Multiplier != 2) {
		return errors.New("请选择有效服务器和计费口径（1 或 2 倍）")
	}
	if request.NodeId > 0 {
		var node model.Node
		if err := database.GetDB().Select("id").First(&node, request.NodeId).Error; err != nil {
			return err
		}
	}
	return database.GetDB().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "node_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"multiplier"}),
	}).Create(&model.ServerUsageBilling{NodeId: request.NodeId, Multiplier: request.Multiplier}).Error
}

func (s *NodeService) Usage(email string, nodeID *int) (*ServerUsageReport, error) {
	var result *ServerUsageReport
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = readServerUsage(tx, email, nodeID)
		return err
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func readServerUsage(db *gorm.DB, email string, nodeID *int) (*ServerUsageReport, error) {
	result := &ServerUsageReport{Servers: []ServerUsageSummary{}, Users: []ServerUsageUser{}, GeneratedAt: time.Now().UnixMilli()}
	var nodes []model.Node
	if err := db.Select("id", "name").Order("id").Find(&nodes).Error; err != nil {
		return nil, err
	}
	result.Servers = append(result.Servers, ServerUsageSummary{NodeId: 0, Name: "本机", Local: true})
	for _, n := range nodes {
		result.Servers = append(result.Servers, ServerUsageSummary{NodeId: n.Id, Name: n.Name})
	}
	var billing []model.ServerUsageBilling
	if err := db.Find(&billing).Error; err != nil {
		return nil, err
	}
	var controls []model.ServerUsageControl
	if err := db.Find(&controls).Error; err != nil {
		return nil, err
	}
	controlFor := func(id int, email string) model.ServerUsageControl {
		for _, c := range controls {
			if c.NodeId == id && c.Email == email {
				return c
			}
		}
		return model.ServerUsageControl{Basis: "proxy"}
	}
	adjusted := "CASE WHEN u.up+u.down+COALESCE(ctrl.usage_offset,0) < 0 THEN 0 ELSE u.up+u.down+COALESCE(ctrl.usage_offset,0) END"
	query := db.Table("server_client_usages AS u").Joins("JOIN clients AS c ON c.email=u.email").Joins("LEFT JOIN server_usage_controls AS ctrl ON ctrl.node_id=u.node_id AND ctrl.email=u.email")
	if email != "" {
		query = query.Where("u.email = ?", email)
	}
	var totals []struct {
		NodeId               int
		Up, Down, Used       int64
		Users                int
		StartedAt, UpdatedAt int64
	}
	if err := query.Select("u.node_id, SUM(u.up) AS up, SUM(u.down) AS down, SUM(" + adjusted + ") AS used, COUNT(*) AS users, COALESCE(MIN(NULLIF(u.started_at,0)),0) AS started_at, MAX(u.updated_at) AS updated_at").Group("u.node_id").Scan(&totals).Error; err != nil {
		return nil, err
	}
	for i := range result.Servers {
		row := &result.Servers[i]
		row.BillingMultiplier = 1
		for _, b := range billing {
			if b.NodeId == row.NodeId && b.Multiplier == 2 {
				row.BillingMultiplier = 2
			}
		}
		for _, t := range totals {
			if t.NodeId == row.NodeId {
				row.Up = t.Up
				row.Down = t.Down
				row.Used = t.Used
				row.Users = t.Users
				row.StartedAt = t.StartedAt
				row.UpdatedAt = t.UpdatedAt
			}
		}
		control := controlFor(row.NodeId, email)
		if email == "" {
			row.Unattributed = max(control.UsageOffset, 0)
			row.Used += row.Unattributed
		}
		row.Recorded = row.Up + row.Down
		row.Adjustment = row.Used - row.Recorded
		row.Billable = float64(row.Used) * float64(row.BillingMultiplier)
		row.Quota = control.Quota
		row.QuotaBasis = control.Basis
		row.QuotaUsed, row.Remaining, row.Exceeded = usageBudget(row.Used, row.Billable, control)
		if nodeID == nil || row.NodeId == *nodeID {
			result.Total += row.Used
			result.BillableTotal += row.Billable
			result.UserCount += row.Users
		}
	}
	for i := range result.Servers {
		if nodeID == nil && result.Total > 0 {
			result.Servers[i].Share = float64(result.Servers[i].Used) / float64(result.Total) * 100
		}
		if nodeID == nil && result.BillableTotal > 0 {
			result.Servers[i].BillingShare = result.Servers[i].Billable / result.BillableTotal * 100
		}
	}
	sort.SliceStable(result.Servers, func(i, j int) bool { return result.Servers[i].Used > result.Servers[j].Used })
	if nodeID != nil {
		multiplier := 1
		for _, row := range result.Servers {
			if row.NodeId == *nodeID {
				multiplier = row.BillingMultiplier
			}
		}
		q := db.Table("server_client_usages AS u").Joins("JOIN clients AS c ON c.email=u.email").Joins("LEFT JOIN users AS a ON a.client_id=c.id").Joins("LEFT JOIN server_usage_controls AS ctrl ON ctrl.node_id=u.node_id AND ctrl.email=u.email").Where("u.node_id = ?", *nodeID)
		if err := q.Select("u.email, COALESCE(a.username,u.email) AS username, u.up,u.down," + adjusted + " AS used,u.started_at,u.updated_at").Order("used DESC,u.email ASC").Limit(100).Scan(&result.Users).Error; err != nil {
			return nil, err
		}
		for i := range result.Users {
			row := &result.Users[i]
			control := controlFor(*nodeID, row.Email)
			row.Recorded = row.Up + row.Down
			row.Adjustment = row.Used - row.Recorded
			row.Billable = float64(row.Used) * float64(multiplier)
			row.Quota = control.Quota
			row.QuotaBasis = control.Basis
			row.QuotaUsed, row.Remaining, row.Exceeded = usageBudget(row.Used, row.Billable, control)
			if result.Total > 0 {
				row.Share = float64(row.Used) / float64(result.Total) * 100
			}
		}
		result.Truncated = result.UserCount > len(result.Users)
	}
	return result, nil
}

func usageBudget(used int64, billable float64, control model.ServerUsageControl) (float64, float64, bool) {
	amount := float64(used)
	if control.Basis == "billing" {
		amount = billable
	}
	return amount, max(0, float64(control.Quota)-amount), control.Quota > 0 && amount >= float64(control.Quota)
}
