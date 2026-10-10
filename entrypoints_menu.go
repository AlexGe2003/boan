package main

import (
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func entryMenuValue(s *service.SettingService, p service.EntryPoints, key string, out io.Writer) error {
	values := map[string]string{"admin-url": p.AdminURL, "user-url": p.UserURL, "user-enabled": strconv.FormatBool(p.UserEnabled), "admin-cert": p.AdminCert, "admin-key": p.AdminKey, "user-cert": p.UserCert, "user-key": p.UserKey}
	if value, ok := values[key]; ok {
		fmt.Fprintln(out, value)
		return nil
	}
	getters := map[string]func() (string, error){"base-path": s.GetBasePath, "trusted-proxies": s.GetTrustedProxyCIDRs, "subscription-cert": s.GetSubCertFile, "subscription-key": s.GetSubKeyFile, "subscription-url": s.GetSubURI}
	if key == "block-domestic" {
		value, err := s.GetWebsiteGeoBlockEnable()
		if err != nil {
			return err
		}
		fmt.Fprintln(out, strconv.FormatBool(value))
		return nil
	}
	if get, ok := getters[key]; ok {
		value, err := get()
		if err != nil {
			return err
		}
		if key == "subscription-url" && value != "" {
			u, err := url.Parse(value)
			if err != nil {
				return err
			}
			value = u.Scheme + "://" + u.Host
		}
		fmt.Fprintln(out, value)
		return nil
	}
	return fmt.Errorf("不支持的配置项：%s", key)
}

func entryMenuSummary(s *service.SettingService, p service.EntryPoints, out io.Writer) error {
	settings, err := s.GetAllSetting()
	if err != nil {
		return err
	}
	hosts, err := (&service.HostService{}).GetHosts()
	if err != nil {
		return err
	}
	regions, err := s.GetWebsiteGeoBlockRegions()
	if err != nil {
		return err
	}
	text := func(v string) string {
		if v == "" {
			return "未配置"
		}
		return v
	}
	state := func(v bool) string {
		if v {
			return "已开启"
		}
		return "已关闭"
	}
	regions = strings.NewReplacer("CN", "中国大陆", "HK", "香港", "MO", "澳门", "TW", "台湾", ",", "、").Replace(regions)
	fmt.Fprintf(out, "\n管理员地址：%s\n用户网站：%s\n用户网站访问：%s\n订阅入口：%s\n地区屏蔽：%s（%s）\n可信代理：%s\n面板监听：%s:%d\n基础路径：%s\n", text(p.AdminURL), text(p.UserURL), state(p.UserEnabled), text(settings.SubURI), state(settings.WebsiteGeoBlockEnable), regions, text(settings.TrustedProxyCIDRs), settings.WebListen, settings.WebPort, settings.WebBasePath)
	fmt.Fprintf(out, "管理员证书：%s\n用户证书：%s\n订阅证书：%s\n", text(p.AdminCert), text(p.UserCert), text(settings.SubCertFile))
	fmt.Fprintln(out, "证书路径不代表证书有效；请在 SSL 菜单执行检查。")
	for _, host := range hosts {
		fmt.Fprintf(out, "节点 %s（入站 %v）：%v\n", host.Remark, host.InboundIds, host.Hosts)
	}
	return nil
}
