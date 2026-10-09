package model

// Only observed byte deltas are retained; no destination hosts or IPs are stored.
type ClientUsageHour struct {
	Id     int    `gorm:"primaryKey;autoIncrement"`
	Email  string `gorm:"uniqueIndex:idx_client_usage_hour,priority:1;index;not null"`
	NodeID int    `gorm:"uniqueIndex:idx_client_usage_hour,priority:2;not null"`
	Bucket int64  `gorm:"uniqueIndex:idx_client_usage_hour,priority:3;index;not null"`
	Up     int64
	Down   int64
}
