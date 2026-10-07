package model

type NodeClientTraffic struct {
	Id       int    `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeId   int    `json:"nodeId" gorm:"uniqueIndex:idx_node_email,priority:1;not null"`
	Email    string `json:"email" gorm:"uniqueIndex:idx_node_email,priority:2;not null"`
	RawUp    int64  `json:"rawUp" gorm:"default:0"`
	RawDown  int64  `json:"rawDown" gorm:"default:0"`
	RawKnown bool   `json:"rawKnown" gorm:"default:false"`
	Up       int64  `json:"up"`
	Down     int64  `json:"down"`
}
