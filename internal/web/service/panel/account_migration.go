package panel

import (
	"errors"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

// MigrateLegacyAccount requires an explicit identity mapping and transfers any
// infrastructure ownership to an administrator in the same transaction.
func (s *UserService) MigrateLegacyAccount(id, clientID, ownerID int) error {
	if id <= 0 || clientID <= 0 {
		return errors.New("请选择旧账号和对应的订阅用户")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.First(&user, id).Error; err != nil {
			return err
		}
		if user.Role == model.RoleAdmin || user.Role == model.RoleCustomer {
			return errors.New("只能迁移待处理的旧后台账号")
		}
		if user.ClientID != nil && *user.ClientID != clientID {
			return errors.New("旧账号已有关联，不能覆盖为其他用户")
		}
		var client model.ClientRecord
		if err := tx.First(&client, clientID).Error; err != nil {
			return errors.New("订阅用户不存在")
		}
		var occupied int64
		if err := tx.Model(&model.User{}).Where("client_id = ? AND id <> ?", clientID, id).Count(&occupied).Error; err != nil {
			return err
		}
		if occupied > 0 {
			return errors.New("该订阅用户已绑定其他登录账号")
		}
		var count int64
		if err := tx.Model(&model.Inbound{}).Where("user_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			var owner model.User
			if ownerID <= 0 {
				return errors.New("请选择接收旧入站的管理员")
			}
			if err := tx.First(&owner, ownerID).Error; err != nil {
				return err
			}
			if !owner.IsAdmin() {
				return errors.New("入站只能移交给管理员")
			}
			if err := tx.Model(&model.Inbound{}).Where("user_id = ?", id).Update("user_id", ownerID).Error; err != nil {
				return err
			}
		}
		return tx.Model(&user).Updates(map[string]any{"role": model.RoleCustomer, "client_id": clientID, "login_epoch": gorm.Expr("login_epoch + 1")}).Error
	})
}
