package service

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

type ServerUsageControlRequest struct {
	NodeId      int    `json:"nodeId" example:"1"`
	Email       string `json:"email" example:"alice"`
	Quota       int64  `json:"quota" example:"107374182400"`
	Basis       string `json:"basis" example:"proxy"`
	AdjustUsage bool   `json:"adjustUsage" example:"false"`
	Used        int64  `json:"used" example:"21474836480"`
}

func (s *NodeService) SetUsageControl(request ServerUsageControlRequest) error {
	if request.NodeId < 0 || request.Quota < 0 || request.Quota > 9007199254740991 || request.Used < 0 || request.Used > 9007199254740991 || (request.Basis != "proxy" && request.Basis != "billing") {
		return errors.New("请输入有效节点、非负额度和统计口径")
	}
	return runSerializedTx(func(tx *gorm.DB) error {
		if request.NodeId > 0 {
			var node model.Node
			if err := tx.Select("id").First(&node, request.NodeId).Error; err != nil {
				return err
			}
		}
		if request.Email != "" {
			var client model.ClientRecord
			if err := tx.Select("id").Where("email = ?", request.Email).First(&client).Error; err != nil {
				return err
			}
		}
		report, err := readServerUsage(tx, request.Email, nil)
		if err != nil {
			return err
		}
		var current ServerUsageSummary
		for _, row := range report.Servers {
			if row.NodeId == request.NodeId {
				current = row
			}
		}
		control := model.ServerUsageControl{NodeId: request.NodeId, Email: request.Email, Basis: request.Basis, Quota: request.Quota}
		var previous model.ServerUsageControl
		err = tx.Where("node_id = ? AND email = ?", request.NodeId, request.Email).First(&previous).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		control.UsageOffset = previous.UsageOffset
		if request.AdjustUsage {
			if request.Email == "" {
				attributed := current.Used - current.Unattributed
				if request.Used < attributed {
					return errors.New("节点已用量不能低于已归属用户的统计用量；请先校正对应用户")
				}
				control.UsageOffset = request.Used - attributed
			} else {
				control.UsageOffset = request.Used - current.Recorded
			}
		}
		if request.Email != "" {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.ServerClientUsage{NodeId: request.NodeId, Email: request.Email}).Error; err != nil {
				return err
			}
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "node_id"}, {Name: "email"}},
			DoUpdates: clause.AssignmentColumns([]string{"quota", "basis", "usage_offset", "updated_at"}),
		}).Create(&control).Error
	})
}
