package model

// Resource and pricing records are operator metadata, not measured limits or payment receipts.
type NodeGroupBuyConfig struct {
	NodeId         int    `json:"nodeId" gorm:"primaryKey;autoIncrement:false" example:"1"`
	GroupName      string `json:"groupName" example:"香港美国拼团"`
	Provider       string `json:"provider" example:"演示供应商"`
	Region         string `json:"region" example:"香港"`
	MonthlyPrice   int64  `json:"monthlyPrice" example:"10000"`
	ExpiresAt      int64  `json:"expiresAt" example:"1793505600000"`
	BandwidthMbps  int    `json:"bandwidthMbps" example:"1000"`
	BandwidthMode  string `json:"bandwidthMode" example:"shared"`
	MonthlyTraffic int64  `json:"monthlyTraffic" example:"1099511627776"`
	MemberCount    int    `json:"memberCount" example:"10"`
	FeeMode        string `json:"feeMode" example:"percent"`
	FeeValue       int64  `json:"feeValue" example:"1000"`
	Notes          string `json:"notes" example:"每月分摊，双向计费"`
	UpdatedAt      int64  `json:"updatedAt" gorm:"autoUpdateTime:milli" example:"1790800500000"`
}
