package panel

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"
	ldaputil "github.com/mhsanaei/3x-ui/v3/internal/util/ldap"
	"github.com/mhsanaei/3x-ui/v3/internal/util/totp"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

// UserService provides business logic for user management and authentication.
// It handles user creation, login, password management, and 2FA operations.
type UserService struct {
	settingService service.SettingService
}

// GetFirstUser retrieves the first user from the database.
// This is typically used for initial setup or when there's only one admin user.
func (s *UserService) GetFirstUser() (*model.User, error) {
	db := database.GetDB()

	user := &model.User{}
	err := db.Model(model.User{}).
		First(user).
		Error
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetFirstAdmin is the account API tokens and node mTLS act as.
func (s *UserService) GetFirstAdmin() (*model.User, error) {
	user := &model.User{}
	err := database.GetDB().Where("role = ?", model.RoleAdmin).Order("id ASC").First(user).Error
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) CheckUser(username string, password string, twoFactorCode string) (*model.User, error) {
	db := database.GetDB()

	user := &model.User{}

	err := db.Model(model.User{}).
		Where("username = ?", username).
		First(user).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("invalid credentials")
	} else if err != nil {
		logger.Warning("check user err:", err)
		return nil, err
	}

	if !crypto.CheckPasswordHash(user.Password, password) {
		ldapEnabled, _ := s.settingService.GetLdapEnable()
		if !ldapEnabled {
			return nil, errors.New("invalid credentials")
		}

		host, _ := s.settingService.GetLdapHost()
		port, _ := s.settingService.GetLdapPort()
		useTLS, _ := s.settingService.GetLdapUseTLS()
		skipVerify, _ := s.settingService.GetLdapInsecureSkipVerify()
		bindDN, _ := s.settingService.GetLdapBindDN()
		ldapPass, _ := s.settingService.GetLdapPassword()
		baseDN, _ := s.settingService.GetLdapBaseDN()
		userFilter, _ := s.settingService.GetLdapUserFilter()
		userAttr, _ := s.settingService.GetLdapUserAttr()

		cfg := ldaputil.Config{
			Host:               host,
			Port:               port,
			UseTLS:             useTLS,
			InsecureSkipVerify: skipVerify,
			BindDN:             bindDN,
			Password:           ldapPass,
			BaseDN:             baseDN,
			UserFilter:         userFilter,
			UserAttr:           userAttr,
		}
		ok, err := ldaputil.AuthenticateUser(cfg, username, password)
		if err != nil || !ok {
			return nil, errors.New("invalid credentials")
		}
	}

	twoFactorEnable, err := s.settingService.GetTwoFactorEnable()
	if err != nil {
		logger.Warning("check two factor err:", err)
		return nil, err
	}

	if twoFactorEnable && user.Role != model.RoleCustomer {
		twoFactorToken, err := s.settingService.GetTwoFactorToken()
		if err != nil {
			logger.Warning("check two factor token err:", err)
			return nil, err
		}

		if !totp.VerifyWithSkew(twoFactorToken, twoFactorCode, time.Now()) {
			return nil, errors.New("invalid 2fa code")
		}
	}

	return user, nil
}

func (s *UserService) BumpLoginEpoch() error {
	db := database.GetDB()
	return db.Model(model.User{}).
		Where("1 = 1").
		Update("login_epoch", gorm.Expr("login_epoch + 1")).
		Error
}

func (s *UserService) UpdateUser(id int, username string, password string) error {
	hashedPassword, err := crypto.HashPasswordAsBcrypt(password)
	if err != nil {
		return err
	}
	return database.GetDB().Model(model.User{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"username":    username,
			"password":    hashedPassword,
			"login_epoch": gorm.Expr("login_epoch + 1"),
		}).
		Error
}

func (s *UserService) UpdateFirstUser(username string, password string) error {
	if username == "" {
		return errors.New("username can not be empty")
	} else if password == "" {
		return errors.New("password can not be empty")
	}
	hashedPassword, er := crypto.HashPasswordAsBcrypt(password)

	if er != nil {
		return er
	}

	db := database.GetDB()
	user := &model.User{}
	err := db.Model(model.User{}).First(user).Error
	if database.IsNotFound(err) {
		user.Username = username
		user.Password = hashedPassword
		user.Role = model.RoleAdmin
		return db.Model(model.User{}).Create(user).Error
	} else if err != nil {
		return err
	}
	user.Username = username
	user.Password = hashedPassword
	user.LoginEpoch++
	return db.Save(user).Error
}

var ErrLastAdmin = errors.New("cannot remove the last admin")

type PanelUser struct {
	Id                 int    `json:"id"`
	Username           string `json:"username"`
	Role               string `json:"role"`
	InboundCount       int64  `json:"inboundCount"`
	ClientID           *int   `json:"clientId,omitempty"`
	SubscriptionStatus string `json:"subscriptionStatus,omitempty"`
}

func (s *UserService) ListPanelUsers() ([]PanelUser, error) {
	rows := make([]PanelUser, 0)
	if err := database.GetDB().Model(&model.User{}).
		Select("users.id, users.username, users.role, users.client_id, CASE WHEN users.role <> 'customer' THEN '' WHEN c.id IS NOT NULL THEN 'linked' WHEN users.client_id IS NULL OR users.client_id = 0 THEN 'unbound' ELSE 'missing' END AS subscription_status").
		Joins("LEFT JOIN clients c ON c.id = users.client_id").Order("users.id ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	var counts []struct {
		UserId int   `gorm:"column:user_id"`
		Total  int64 `gorm:"column:total"`
	}
	if err := database.GetDB().Model(&model.Inbound{}).
		Select("user_id, COUNT(*) AS total").Group("user_id").Scan(&counts).Error; err != nil {
		return nil, err
	}
	countByUser := make(map[int]int64, len(counts))
	for _, count := range counts {
		countByUser[count.UserId] = count.Total
	}
	for i := range rows {
		rows[i].InboundCount = countByUser[rows[i].Id]
	}
	return rows, nil
}

func (s *UserService) CreatePanelUser(username, password, role string) (*PanelUser, error) {
	username = strings.TrimSpace(username)
	if username == "" || strings.ContainsAny(username, " \t\r\n") {
		return nil, errors.New("a username without spaces is required")
	}
	if len(password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}
	if role == "" {
		role = model.RoleUser
	}
	if _, err := s.RolePages(role); err != nil {
		return nil, errors.New("invalid role")
	}
	hashed, err := crypto.HashPasswordAsBcrypt(password)
	if err != nil {
		return nil, err
	}
	user := &model.User{Username: username, Password: hashed, Role: role}
	if err := database.GetDB().Create(user).Error; err != nil {
		return nil, err
	}
	return &PanelUser{Id: user.Id, Username: user.Username, Role: user.Role}, nil
}

func (s *UserService) UpdatePanelUsername(id int, username string) error {
	username = strings.TrimSpace(username)
	if username == "" || strings.ContainsAny(username, " \t\r\n") {
		return errors.New("a username without spaces is required")
	}
	result := database.GetDB().Model(&model.User{}).Where("id = ?", id).Update("username", username)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *UserService) SetPanelUserRole(id int, role string) error {
	if _, err := s.RolePages(role); err != nil {
		return errors.New("invalid role")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.First(&user, id).Error; err != nil {
			return err
		}
		if user.IsAdmin() && role != model.RoleAdmin {
			var n int64
			if err := tx.Model(&model.User{}).Where("role = ?", model.RoleAdmin).Count(&n).Error; err != nil {
				return err
			}
			if n <= 1 {
				return ErrLastAdmin
			}
		}
		return tx.Model(&model.User{}).Where("id = ?", id).Update("role", role).Error
	})
}

func (s *UserService) DeletePanelUser(id, reassignTo int) error {
	return s.deletePanelUser(id, reassignTo, false)
}

func (s *UserService) DeleteOrphanSubscriber(id, reassignTo int) error {
	return s.deletePanelUser(id, reassignTo, true)
}

func (s *UserService) deletePanelUser(id, reassignTo int, onlyOrphan bool) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.First(&user, id).Error; err != nil {
			return err
		}
		if onlyOrphan {
			if user.Role != model.RoleCustomer {
				return errors.New("该操作仅适用于失效的订阅登录账号")
			}
			if user.ClientID != nil {
				var linked int64
				if err := tx.Model(&model.ClientRecord{}).Where("id = ?", *user.ClientID).Count(&linked).Error; err != nil {
					return err
				}
				if linked > 0 {
					return errors.New("该账号已有有效的订阅绑定，请刷新列表后在用户管理中处理")
				}
			}
		}
		if user.IsAdmin() {
			var admins int64
			if err := tx.Model(&model.User{}).Where("role = ?", model.RoleAdmin).Count(&admins).Error; err != nil {
				return err
			}
			if admins <= 1 {
				return ErrLastAdmin
			}
		}
		var inboundCount int64
		if err := tx.Model(&model.Inbound{}).Where("user_id = ?", id).Count(&inboundCount).Error; err != nil {
			return err
		}
		if inboundCount > 0 {
			if reassignTo <= 0 || reassignTo == id {
				return errors.New("select another account to receive assigned inbounds")
			}
			var target model.User
			if err := tx.First(&target, reassignTo).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.Inbound{}).Where("user_id = ?", id).
				Update("user_id", reassignTo).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&model.User{}, id).Error
	})
}
