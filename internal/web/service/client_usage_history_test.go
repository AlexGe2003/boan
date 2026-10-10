package service

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestClientUsageHistoryBucketsAndOwnership(t *testing.T) {
	initClientHwidTestDB(t)
	db := database.GetDB()
	now := time.Date(2026, 10, 8, 16, 40, 0, 0, time.UTC)
	for _, row := range []struct {
		email    string
		node     int
		up, down int64
		at       time.Time
	}{
		{"alice", 0, 10, 20, now.Add(-time.Hour)},
		{"alice", 0, 5, 7, now.Add(-time.Hour)},
		{"alice", 0, 3, 4, now},
		{"alice", 1, 100, 200, now},
		{"alice", 1, 50, 60, now.Add(-2 * 24 * time.Hour)},
		{"alice", 1, 99, 99, now.Add(-31 * 24 * time.Hour)},
		{"bob", 0, 999, 999, now},
	} {
		if err := recordClientUsageHour(db, row.node, row.email, row.up, row.down, row.at); err != nil {
			t.Fatal(err)
		}
	}
	svc := &ClientService{}
	hourly, err := svc.UsageHistory("alice", "hour", now)
	if err != nil || len(hourly.Points) != 3 {
		t.Fatalf("hourly: %+v, %v", hourly, err)
	}
	if hourly.Points[0].Up != 15 || hourly.Points[0].Down != 27 || hourly.Points[0].Bucket != now.Add(-time.Hour).Truncate(time.Hour).UnixMilli() {
		t.Fatal("hour accumulation failed", hourly.Points)
	}
	daily, err := svc.UsageHistory("alice", "day", now)
	if err != nil || len(daily.Points) != 3 {
		t.Fatalf("daily: %+v, %v", daily, err)
	}
	for _, point := range daily.Points {
		if point.Bucket == now.Truncate(24*time.Hour).UnixMilli() && point.NodeID == 0 && (point.Up != 18 || point.Down != 31) {
			t.Fatal("daily rollup failed", point)
		}
		if point.Up == 999 {
			t.Fatal("foreign traffic exposed")
		}
	}
	var count int64
	if err := db.Model(&model.ClientUsageHour{}).Where("email = ?", "alice").Count(&count).Error; err != nil || count != 5 {
		t.Fatal("reading history mutated source rows", count, err)
	}
}

func TestClientUsageHourRollsBackAndClamps(t *testing.T) {
	initClientHwidTestDB(t)
	db := database.GetDB()
	now := time.Now()
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := recordClientUsageHour(tx, 0, "rollback", 10, 20, now); err != nil {
			return err
		}
		return errors.New("abort")
	})
	if err == nil {
		t.Fatal("transaction should abort")
	}
	var count int64
	db.Model(&model.ClientUsageHour{}).Count(&count)
	if count != 0 {
		t.Fatal("rolled-back traffic left history")
	}
	for i := 0; i < 2; i++ {
		if err := recordClientUsageHour(db, 0, "overflow", database.TrafficMax, database.TrafficMax, now); err != nil {
			t.Fatal(err)
		}
	}
	var row model.ClientUsageHour
	if err := db.First(&row).Error; err != nil || row.Up != database.TrafficMax || row.Down != database.TrafficMax {
		t.Fatal(row, err)
	}
	if err := recordClientUsageHour(db, 0, "negative", -1, -2, now); err != nil {
		t.Fatal(err)
	}
	db.Model(&model.ClientUsageHour{}).Count(&count)
	if count != 1 {
		t.Fatal("invalid deltas created history")
	}
}

func TestClientUsageHistoryRetention(t *testing.T) {
	initClientHwidTestDB(t)
	db := database.GetDB()
	cutoff := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -29)
	for _, at := range []time.Time{cutoff.Add(-time.Hour), cutoff, cutoff.Add(time.Hour)} {
		if err := recordClientUsageHour(db, 0, "alice", 1, 2, at); err != nil {
			t.Fatal(err)
		}
	}
	if err := PruneClientUsageHistory(); err != nil {
		t.Fatal(err)
	}
	var rows []model.ClientUsageHour
	if err := db.Order("bucket").Find(&rows).Error; err != nil || len(rows) != 2 || rows[0].Bucket != cutoff.UnixMilli() {
		t.Fatal("retention boundary", rows, err)
	}
}
