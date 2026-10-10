package service

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

type NodeGroupBuyItem struct {
	NodeId       int                      `json:"nodeId" example:"1"`
	Name         string                   `json:"name" example:"香港节点"`
	Configured   bool                     `json:"configured" example:"true"`
	Config       model.NodeGroupBuyConfig `json:"config"`
	MonthlyFee   int64                    `json:"monthlyFee" example:"1000"`
	MonthlyTotal int64                    `json:"monthlyTotal" example:"11000"`
	PerMember    int64                    `json:"perMember" example:"1100"`
	ExpiryStatus string                   `json:"expiryStatus" example:"active"`
}
type NodeGroupBuyReport struct {
	Nodes        []NodeGroupBuyItem `json:"nodes"`
	MonthlyCost  int64              `json:"monthlyCost" example:"10000"`
	MonthlyFee   int64              `json:"monthlyFee" example:"1000"`
	MonthlyTotal int64              `json:"monthlyTotal" example:"11000"`
	DueSoon      int                `json:"dueSoon" example:"1"`
	Expired      int                `json:"expired" example:"0"`
	CheckedAt    int64              `json:"checkedAt" example:"1790800500000"`
}

func (s *NodeService) SetGroupBuy(config model.NodeGroupBuyConfig) error {
	config.GroupName = strings.TrimSpace(config.GroupName)
	config.Provider = strings.TrimSpace(config.Provider)
	config.Region = strings.TrimSpace(config.Region)
	if config.NodeId < 0 || utf8.RuneCountInString(config.GroupName) > 60 || utf8.RuneCountInString(config.Provider) > 60 || utf8.RuneCountInString(config.Region) > 60 || utf8.RuneCountInString(config.Notes) > 1000 || config.MonthlyPrice < 0 || config.MonthlyPrice > 1000000000 || config.ExpiresAt < 0 || config.ExpiresAt > 4102444800000 || config.BandwidthMbps < 0 || config.BandwidthMbps > 10000000 || config.MonthlyTraffic < 0 || config.MonthlyTraffic > 9007199254740991 || config.MemberCount < 0 || config.MemberCount > 100000 || (config.BandwidthMode != "shared" && config.BandwidthMode != "dedicated") || (config.FeeMode != "fixed" && config.FeeMode != "percent") || config.FeeValue < 0 || config.FeeValue > 1000000000 || (config.FeeMode == "percent" && config.FeeValue > 10000) {
		return errors.New("请检查月租、到期时间、带宽、流量、人数和手续费设置")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if config.NodeId > 0 {
			var node model.Node
			if err := tx.Select("id").First(&node, config.NodeId).Error; err != nil {
				return err
			}
		}
		config.UpdatedAt = time.Now().UnixMilli()
		return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "node_id"}}, DoUpdates: clause.AssignmentColumns([]string{"group_name", "provider", "region", "monthly_price", "expires_at", "bandwidth_mbps", "bandwidth_mode", "monthly_traffic", "member_count", "fee_mode", "fee_value", "notes", "updated_at"})}).Create(&config).Error
	})
}

func (s *NodeService) GroupBuy() (*NodeGroupBuyReport, error) {
	report := &NodeGroupBuyReport{Nodes: []NodeGroupBuyItem{}, CheckedAt: time.Now().UnixMilli()}
	var nodes []model.Node
	if err := database.GetDB().Select("id", "name").Order("id").Find(&nodes).Error; err != nil {
		return nil, err
	}
	nodes = append([]model.Node{{Id: 0, Name: "本机"}}, nodes...)
	var configs []model.NodeGroupBuyConfig
	if err := database.GetDB().Find(&configs).Error; err != nil {
		return nil, err
	}
	byID := make(map[int]model.NodeGroupBuyConfig, len(configs))
	for _, config := range configs {
		byID[config.NodeId] = config
	}
	for _, node := range nodes {
		config, configured := byID[node.Id]
		if !configured {
			config = model.NodeGroupBuyConfig{NodeId: node.Id, FeeMode: "fixed", BandwidthMode: "shared"}
		}
		row := NodeGroupBuyItem{NodeId: node.Id, Name: node.Name, Configured: configured, Config: config, ExpiryStatus: "unset"}
		row.MonthlyFee = config.FeeValue
		if config.FeeMode == "percent" {
			row.MonthlyFee = (config.MonthlyPrice*config.FeeValue + 9999) / 10000
		}
		row.MonthlyTotal = config.MonthlyPrice + row.MonthlyFee
		if config.MemberCount > 0 {
			row.PerMember = (row.MonthlyTotal + int64(config.MemberCount) - 1) / int64(config.MemberCount)
		}
		if config.ExpiresAt > 0 {
			if config.ExpiresAt <= report.CheckedAt {
				row.ExpiryStatus = "expired"
				report.Expired++
			} else if config.ExpiresAt-report.CheckedAt <= 7*24*60*60*1000 {
				row.ExpiryStatus = "soon"
				report.DueSoon++
			} else {
				row.ExpiryStatus = "active"
			}
		}
		report.MonthlyCost += config.MonthlyPrice
		report.MonthlyFee += row.MonthlyFee
		report.MonthlyTotal += row.MonthlyTotal
		report.Nodes = append(report.Nodes, row)
	}
	return report, nil
}
