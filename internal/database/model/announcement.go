package model

type Announcement struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	Title     string `json:"title" gorm:"size:255;not null"`
	Content   string `json:"content" gorm:"type:text;not null"`
	Tag       string `json:"tag" gorm:"size:32;default:'notice'"`
	Popup     bool   `json:"popup"`
	Pinned    bool   `json:"pinned" gorm:"default:false"`
	Enabled   bool   `json:"enabled"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}
