package model

// Usage is an observed lifetime total; quota resets leave it intact.
type ServerClientUsage struct {
	Id        int    `gorm:"primaryKey;autoIncrement"`
	NodeId    int    `gorm:"uniqueIndex:idx_server_usage_email,priority:1;not null"`
	Email     string `gorm:"uniqueIndex:idx_server_usage_email,priority:2;index;not null"`
	Up        int64
	Down      int64
	StartedAt int64
	UpdatedAt int64
}

// Billing estimates are independent of subscriber quota counters.
type ServerUsageBilling struct {
	NodeId     int `gorm:"primaryKey;autoIncrement:false"`
	Multiplier int `gorm:"not null;default:1"`
}

// Manual budgets and corrections never replace observed counters or subscription quotas.
type ServerUsageControl struct {
	Id          int    `gorm:"primaryKey;autoIncrement"`
	NodeId      int    `gorm:"uniqueIndex:idx_usage_control,priority:1;not null"`
	Email       string `gorm:"uniqueIndex:idx_usage_control,priority:2;not null"`
	Quota       int64
	Basis       string `gorm:"not null;default:proxy"`
	UsageOffset int64
	UpdatedAt   int64 `gorm:"autoUpdateTime:milli"`
}
