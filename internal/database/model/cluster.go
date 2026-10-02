package model

// ClusterState stores the durable, encrypted handoff journal.
type ClusterState struct {
	ID   int    `gorm:"primaryKey;autoIncrement:false"`
	Data string `gorm:"type:text;not null"`
}

// ClusterBackup retains the destination's previous management data for manual
// disaster recovery. Never activate it without reconciling the fleet epoch.
type ClusterBackup struct {
	ID   int    `gorm:"primaryKey;autoIncrement:false"`
	Data string `gorm:"type:text;not null"`
}
