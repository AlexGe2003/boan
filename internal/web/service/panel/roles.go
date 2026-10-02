package panel

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

var UserPanelPages = []string{
	"/", "/inbounds", "/clients", "/hosts", "/my-subscriptions", "/node-monitor",
}

var AdminPanelPages = []string{
	"/", "/inbounds", "/clients", "/hosts", "/my-subscriptions", "/node-monitor",
	"/support", "/plans", "/group-buy", "/node-groups", "/orders", "/groups", "/nodes", "/outbound", "/routing", "/settings", "/users", "/xray", "/api-docs",
}

var allowedCustomPage = func() map[string]bool {
	pages := make(map[string]bool, len(UserPanelPages))
	for _, page := range UserPanelPages {
		pages[page] = true
	}
	return pages
}()

type PanelRoleInfo struct {
	Key    string   `json:"key"`
	Name   string   `json:"name"`
	Pages  []string `json:"pages"`
	System bool     `json:"system"`
}

func validateRolePages(pages []string) ([]string, error) {
	if len(pages) == 0 {
		return nil, errors.New("select at least one page")
	}
	seen := make(map[string]bool, len(pages))
	out := make([]string, 0, len(pages))
	for _, page := range pages {
		if !allowedCustomPage[page] {
			return nil, errors.New("invalid page permission")
		}
		if !seen[page] {
			seen[page] = true
			out = append(out, page)
		}
	}
	return out, nil
}

func (s *UserService) RolePages(key string) ([]string, error) {
	switch key {
	case model.RoleAdmin:
		return append([]string(nil), AdminPanelPages...), nil
	case model.RoleCustomer:
		return []string{"/my-subscriptions"}, nil
	case model.RoleUser:
		return append([]string(nil), UserPanelPages...), nil
	}
	var row model.PanelRoleDefinition
	if err := database.GetDB().Where("key = ?", key).First(&row).Error; err != nil {
		return nil, err
	}
	var pages []string
	if err := json.Unmarshal([]byte(row.Pages), &pages); err != nil {
		return nil, err
	}
	return validateRolePages(pages)
}

func (s *UserService) ListPanelRoles() ([]PanelRoleInfo, error) {
	roles := []PanelRoleInfo{
		{Key: model.RoleCustomer, Name: "订阅用户", Pages: []string{"/my-subscriptions"}, System: true},
		{Key: model.RoleAdmin, Name: "Admin", Pages: append([]string(nil), AdminPanelPages...), System: true},
		{Key: model.RoleUser, Name: "User", Pages: append([]string(nil), UserPanelPages...), System: true},
	}
	var rows []model.PanelRoleDefinition
	if err := database.GetDB().Order("name ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		var pages []string
		if err := json.Unmarshal([]byte(row.Pages), &pages); err != nil {
			return nil, err
		}
		roles = append(roles, PanelRoleInfo{Key: row.Key, Name: row.Name, Pages: pages})
	}
	return roles, nil
}

func (s *UserService) CreatePanelRole(name string, pages []string) (*PanelRoleInfo, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("role name is required")
	}
	pages, err := validateRolePages(pages)
	if err != nil {
		return nil, err
	}
	raw := make([]byte, 8)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	key := "custom_" + hex.EncodeToString(raw)
	encoded, _ := json.Marshal(pages)
	row := model.PanelRoleDefinition{Key: key, Name: name, Pages: string(encoded)}
	if err := database.GetDB().Create(&row).Error; err != nil {
		return nil, err
	}
	return &PanelRoleInfo{Key: key, Name: name, Pages: pages}, nil
}

func (s *UserService) UpdatePanelRole(key, name string, pages []string) error {
	if key == model.RoleAdmin || key == model.RoleUser || key == model.RoleCustomer {
		return errors.New("built-in roles cannot be edited")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("role name is required")
	}
	pages, err := validateRolePages(pages)
	if err != nil {
		return err
	}
	encoded, _ := json.Marshal(pages)
	result := database.GetDB().Model(&model.PanelRoleDefinition{}).Where("key = ?", key).
		Updates(map[string]any{"name": name, "pages": string(encoded)})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *UserService) DeletePanelRole(key string) error {
	if key == model.RoleAdmin || key == model.RoleUser || key == model.RoleCustomer {
		return errors.New("built-in roles cannot be deleted")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var assigned int64
		if err := tx.Model(&model.User{}).Where("role = ?", key).Count(&assigned).Error; err != nil {
			return err
		}
		if assigned != 0 {
			return errors.New("reassign users before deleting this role")
		}
		result := tx.Where("key = ?", key).Delete(&model.PanelRoleDefinition{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}
