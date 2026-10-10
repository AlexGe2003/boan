package service

import (
	"errors"
	"fmt"
	"net/netip"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/geoblock"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func (s *SettingService) GetWebsiteGeoBlockRegions() (string, error) {
	raw, err := s.getString("websiteGeoBlockRegions")
	if err != nil {
		return "", err
	}
	return geoblock.NormalizeRegions(raw)
}

// ConfigureWebsiteGeoBlock validates before writing; disabling must also work
// when the GeoIP database is missing, so SSH can always restore website access.
func (s *SettingService) ConfigureWebsiteGeoBlock(enabled *bool, regions string, trusted *string) error {
	values := map[string]string{}
	if regions != "" {
		normalized, err := geoblock.NormalizeRegions(regions)
		if err != nil {
			return err
		}
		regions = normalized
		values["websiteGeoBlockRegions"] = regions
	}
	if enabled != nil {
		if *enabled {
			if regions == "" {
				var err error
				regions, err = s.GetWebsiteGeoBlockRegions()
				if err != nil {
					return err
				}
			}
			if err := (&geoblock.Matcher{}).LoadRegions(xray.GetGeoipPath(), regions); err != nil {
				return fmt.Errorf("cannot enable website block: %w; update geoip.dat first", err)
			}
		}
		values["websiteGeoBlockEnable"] = strconv.FormatBool(*enabled)
	}
	if trusted != nil {
		var normalized []string
		if strings.TrimSpace(*trusted) != "" {
			for _, raw := range strings.Split(*trusted, ",") {
				raw = strings.TrimSpace(raw)
				if prefix, err := netip.ParsePrefix(raw); err == nil {
					if prefix.Bits() == 0 {
						return fmt.Errorf("do not trust the entire internet as a proxy")
					}
					normalized = append(normalized, prefix.Masked().String())
				} else if ip, err := netip.ParseAddr(raw); err == nil {
					normalized = append(normalized, ip.Unmap().String())
				} else {
					return fmt.Errorf("invalid trusted proxy IP/CIDR: %q", raw)
				}
			}
		}
		values["trustedProxyCIDRs"] = strings.Join(normalized, ",")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		for key, value := range values {
			var row model.Setting
			err := tx.Where("key = ?", key).First(&row).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				row = model.Setting{Key: key, Value: value}
				err = tx.Create(&row).Error
			} else if err == nil {
				err = tx.Model(&row).Update("value", value).Error
			}
			if err != nil {
				return err
			}
		}
		return nil
	})
}
