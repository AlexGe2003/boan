package service

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

type ClientUsagePoint struct {
	NodeID int   `json:"nodeId"`
	Bucket int64 `json:"bucket"`
	Up     int64 `json:"up"`
	Down   int64 `json:"down"`
}

type ClientUsageView struct {
	Traffic     ClientTrafficReport `json:"traffic"`
	Resolution  string              `json:"resolution"`
	GeneratedAt int64               `json:"generatedAt"`
	Points      []ClientUsagePoint  `json:"points"`
}

func recordClientUsageHour(tx *gorm.DB, nodeID int, email string, up, down int64, now time.Time) error {
	up, down = min(max(up, 0), database.TrafficMax), min(max(down, 0), database.TrafficMax)
	if up == 0 && down == 0 {
		return nil
	}
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "email"}, {Name: "node_id"}, {Name: "bucket"}},
		DoUpdates: clause.Assignments(map[string]any{
			"up":   gorm.Expr(database.ClampedAddExpr("client_usage_hours.up"), up),
			"down": gorm.Expr(database.ClampedAddExpr("client_usage_hours.down"), down),
		}),
	}).Create(&model.ClientUsageHour{Email: email, NodeID: nodeID, Bucket: now.UTC().Truncate(time.Hour).UnixMilli(), Up: up, Down: down}).Error
}

func PruneClientUsageHistory() error {
	cutoff := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -29).UnixMilli()
	return database.GetDB().Where("bucket < ?", cutoff).Delete(&model.ClientUsageHour{}).Error
}

func (s *ClientService) UsageHistory(email, resolution string, now time.Time) (ClientUsageView, error) {
	report := ClientUsageView{Resolution: resolution, GeneratedAt: now.UnixMilli(), Points: []ClientUsagePoint{}}
	traffic, err := s.DeviceTraffic(email)
	if err != nil {
		return report, err
	}
	report.Traffic = traffic
	cutoff := now.UTC().Truncate(24*time.Hour).AddDate(0, 0, -29)
	if resolution == "hour" {
		cutoff = now.UTC().Truncate(time.Hour).Add(-23 * time.Hour)
	}
	var rows []model.ClientUsageHour
	if err := database.GetDB().Where("email = ? AND bucket >= ? AND bucket <= ?", email, cutoff.UnixMilli(), now.UnixMilli()).Order("bucket, node_id").Find(&rows).Error; err != nil {
		return report, err
	}
	indices := map[[2]int64]int{}
	for _, row := range rows {
		bucket := row.Bucket
		if resolution == "day" {
			bucket = time.UnixMilli(bucket).UTC().Truncate(24 * time.Hour).UnixMilli()
		}
		key := [2]int64{int64(row.NodeID), bucket}
		index, exists := indices[key]
		if !exists {
			index = len(report.Points)
			indices[key] = index
			report.Points = append(report.Points, ClientUsagePoint{NodeID: row.NodeID, Bucket: bucket})
		}
		point := &report.Points[index]
		point.Up += min(max(row.Up, 0), database.TrafficMax-point.Up)
		point.Down += min(max(row.Down, 0), database.TrafficMax-point.Down)
	}
	return report, nil
}
