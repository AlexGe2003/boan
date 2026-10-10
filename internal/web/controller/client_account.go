package controller

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func validSubscriberPassword(password string) bool {
	return password == "user" || (len(password) >= 8 && len(password) <= 72)
}

// clientAccount configures the login belonging to a single subscription identity.
func (a *ClientController) clientAccount(c *gin.Context) {
	current := session.GetLoginUser(c)
	if current == nil || !current.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	client, err := a.clientService.GetRecordByEmail(nil, c.Param("email"))
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var user model.User
		err := database.GetDB().Where("client_id = ?", client.Id).First(&user).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			jsonObj(c, gin.H{"username": ""}, nil)
			return
		}
		jsonObj(c, gin.H{"username": user.Username}, err)
		return
	}
	var form struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		jsonObj(c, nil, err)
		return
	}
	form.Username = strings.TrimSpace(form.Username)
	if form.Username == "" || strings.ContainsAny(form.Username, " \t\r\n") {
		jsonObj(c, nil, errors.New("请输入不含空格的登录账号"))
		return
	}
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		var user model.User
		err := tx.Where("client_id = ?", client.Id).First(&user).Error
		creating := errors.Is(err, gorm.ErrRecordNotFound)
		if err != nil && !creating {
			return err
		}
		if creating && form.Password == "" {
			return errors.New("首次开通需要设置登录密码")
		}
		if form.Password != "" {
			if !validSubscriberPassword(form.Password) {
				return errors.New("使用默认密码 user，或设置 8–72 字节的密码")
			}
			hashed, err := crypto.HashPasswordAsBcrypt(form.Password)
			if err != nil {
				return err
			}
			user.Password = hashed
		}
		user.Username = form.Username
		if !user.IsAdmin() {
			user.Role = model.RoleCustomer
		}
		user.ClientID = &client.Id
		user.LoginEpoch++
		return tx.Save(&user).Error
	})
	jsonObj(c, nil, err)
}
