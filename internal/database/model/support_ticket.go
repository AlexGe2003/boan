package model

type SupportTicket struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	UserID    int    `json:"userId" gorm:"index"`
	Subject   string `json:"subject"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}
type SupportMessage struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	TicketID  int    `json:"ticketId" gorm:"index"`
	FromAdmin bool   `json:"fromAdmin"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
}
