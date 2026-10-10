package main

import (
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/config"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/entity"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func entryPointsCLI(args []string, out io.Writer) error {
	fs := flag.NewFlagSet("entry", flag.ContinueOnError)
	fs.SetOutput(out)
	admin := fs.String("admin-url", "", "Administrator URL including current panel base path")
	user := fs.String("user-url", "", "User URL including current panel base path")
	enabled := fs.String("user-enabled", "", "true or false; applies immediately")
	blockDomestic := fs.String("block-domestic", "", "true or false: block CN, HK, MO and TW website visitors immediately")
	regions := fs.String("blocked-regions", "CN,HK,MO,TW", "Regions used with -block-domestic: CN,HK,MO,TW")
	trusted := fs.String("trusted-proxies", "", "Comma-separated trusted proxy IPs/CIDRs; empty disables forwarded headers")
	sub := fs.String("subscription-url", "", "Subscription origin, e.g. https://sub.example.com:2096")
	target := fs.String("target", "", "Certificate target: admin, user, both, subscription")
	cert := fs.String("cert", "", "Certificate full-chain file")
	key := fs.String("key", "", "Private-key file")
	inbound := fs.Int("inbound-id", 0, "Inbound to advertise with node-address")
	address := fs.String("node-address", "", "Node hostname or IP (no scheme, path or port)")
	value := fs.String("value", "", "Read one non-secret setting for the interactive menu")
	summary := fs.Bool("summary", false, "Show configuration in Chinese")
	show := fs.Bool("show", false, "Show entry, subscription and node configuration")
	check := fs.Bool("check", false, "Validate direct TLS configuration before restarting")
	reset := fs.Bool("reset", false, "Restore legacy shared login for recovery")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	var trustedValue *string
	regionsSet := false
	fs.Visit(func(f *flag.Flag) {
		if f.Name == "trusted-proxies" {
			trustedValue = trusted
		}
		if f.Name == "blocked-regions" {
			regionsSet = true
		}
	})
	if regionsSet && *blockDomestic == "" {
		return fmt.Errorf("use -blocked-regions together with -block-domestic")
	}
	if (*value != "" || *summary) && fs.NFlag() != 1 {
		return fmt.Errorf("read options cannot be combined with changes")
	}
	geoChange := *blockDomestic != "" || trustedValue != nil
	websiteChange := *admin != "" || *user != "" || *enabled != ""
	certChange := *target != "" || *cert != "" || *key != ""
	if certChange {
		if *cert == "" || *key == "" {
			return fmt.Errorf("both -cert and -key are required")
		}
		switch *target {
		case "admin", "user", "both":
			websiteChange = true
		case "subscription":
		default:
			return fmt.Errorf("target must be admin, user, both or subscription")
		}
	}
	subscriptionChange := *sub != "" || *target == "subscription"
	changes := 0
	for _, changed := range []bool{websiteChange, subscriptionChange, *inbound != 0 || *address != "", *reset, geoChange} {
		if changed {
			changes++
		}
	}
	if changes > 1 {
		return fmt.Errorf("change website, subscription, node or recovery settings separately")
	}
	if err := database.InitDB(config.GetDBPath()); err != nil {
		return err
	}
	defer func() { _ = database.CloseDB() }()
	svc := &service.SettingService{}
	p, err := svc.GetEntryPoints()
	if err != nil && !*reset {
		return err
	}
	if *value != "" {
		return entryMenuValue(svc, p, *value, out)
	}
	if *summary {
		return entryMenuSummary(svc, p, out)
	}
	switch {
	case geoChange:
		var enabledValue *bool
		selected := ""
		if *blockDomestic != "" {
			value, parseErr := strconv.ParseBool(*blockDomestic)
			if parseErr != nil {
				return parseErr
			}
			enabledValue = &value
			if value {
				selected = *regions
			}
		}
		err = svc.ConfigureWebsiteGeoBlock(enabledValue, selected, trustedValue)
	case *reset:
		err = svc.SaveEntryPoints(service.EntryPoints{UserEnabled: true})
	case websiteChange:
		if *admin != "" {
			p.AdminURL = *admin
		}
		if *user != "" {
			p.UserURL = *user
		}
		if *enabled != "" {
			p.UserEnabled, err = strconv.ParseBool(*enabled)
			if err != nil {
				return err
			}
		}
		switch *target {
		case "admin":
			p.AdminCert, p.AdminKey = *cert, *key
		case "user":
			p.UserCert, p.UserKey = *cert, *key
		case "both":
			p.AdminCert, p.AdminKey, p.UserCert, p.UserKey = *cert, *key, *cert, *key
		}
		if certChange {
			var urls []string
			switch *target {
			case "admin":
				urls = []string{p.AdminURL}
			case "user":
				urls = []string{p.UserURL}
			case "both":
				urls = []string{p.AdminURL, p.UserURL}
			}
			for _, raw := range urls {
				if raw == "" {
					return fmt.Errorf("configure the entry URL before its certificate")
				}
				if _, err := service.ValidateEntryCertificate(*cert, *key, service.EntryHost(raw)); err != nil {
					return err
				}
			}
		}
		err = svc.SaveEntryPoints(p)
	case subscriptionChange:
		err = svc.ConfigureSubscriptionOrigin(*sub, *cert, *key)
	case *inbound != 0 || *address != "":
		err = configureNodeAddress(*inbound, *address)
	}
	if err != nil {
		return err
	}
	if *check {
		cfg, err := svc.EntryTLSConfig()
		if err != nil {
			return err
		}
		if cfg == nil {
			fmt.Fprintln(out, "未配置独立入口证书；HTTPS 需要由反向代理或原有面板 TLS 提供。")
		} else {
			for _, raw := range []string{p.AdminURL, p.UserURL} {
				host := service.EntryHost(raw)
				cert, err := cfg.GetCertificate(&tls.ClientHelloInfo{ServerName: host})
				if err != nil {
					return err
				}
				fmt.Fprintf(out, "%s：证书有效期至 %s\n", host, cert.Leaf.NotAfter.Format(time.RFC3339))
			}
		}
		subCert, err := svc.GetSubCertFile()
		if err != nil {
			return err
		}
		subKey, err := svc.GetSubKeyFile()
		if err != nil {
			return err
		}
		if subCert != "" || subKey != "" {
			host, err := svc.GetSubDomain()
			if err != nil {
				return err
			}
			cert, err := service.ValidateEntryCertificate(subCert, subKey, host)
			if err != nil {
				return fmt.Errorf("subscription TLS: %w", err)
			}
			fmt.Fprintf(out, "订阅 %s：证书有效期至 %s\n", host, cert.Leaf.NotAfter.Format(time.RFC3339))
		}
	}
	if changes > 0 {
		fmt.Fprintln(out, "已保存。访问开关立即生效；修改地址或证书后请检查配置并重启。域名解析、代理和监听端口需要与地址一致。")
	}
	if *show || len(args) == 0 {
		p, err = svc.GetEntryPoints()
		if err != nil {
			return err
		}
		settings, err := svc.GetAllSetting()
		if err != nil {
			return err
		}
		hosts, err := (&service.HostService{}).GetHosts()
		if err != nil {
			return err
		}
		base, err := svc.GetBasePath()
		if err != nil {
			return err
		}
		subCert, err := svc.GetSubCertFile()
		if err != nil {
			return err
		}
		subKey, err := svc.GetSubKeyFile()
		if err != nil {
			return err
		}
		blockedRegions, err := svc.GetWebsiteGeoBlockRegions()
		if err != nil {
			return err
		}
		return json.NewEncoder(out).Encode(map[string]any{"websiteGeoBlockEnabled": settings.WebsiteGeoBlockEnable, "websiteBlockedRegions": blockedRegions, "trustedProxyCIDRs": settings.TrustedProxyCIDRs, "entries": p, "basePath": base, "subscriptionURL": settings.SubURI, "subscriptionJSONURL": settings.SubJsonURI, "subscriptionClashURL": settings.SubClashURI, "subscriptionCert": subCert, "subscriptionKey": subKey, "nodes": hosts})
	}
	return nil
}

func configureNodeAddress(id int, address string) error {
	if id <= 0 || address == "" || strings.ContainsAny(address, "/ @?#\\\t\r\n") {
		return fmt.Errorf("provide an inbound-id and a node hostname or IP")
	}
	if net.ParseIP(address) == nil {
		if len(address) > 253 {
			return fmt.Errorf("hostname is too long")
		}
		if strings.Contains(address, ":") {
			return fmt.Errorf("node address must not contain a scheme or port")
		}
		for _, label := range strings.Split(address, ".") {
			if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
				return fmt.Errorf("invalid hostname")
			}
			for _, ch := range label {
				if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') && ch != '-' {
					return fmt.Errorf("invalid hostname")
				}
			}
		}
	}
	var ib model.Inbound
	if err := database.GetDB().First(&ib, id).Error; err != nil {
		return err
	}
	svc := &service.HostService{}
	hosts, err := svc.GetHostsByInbound(id)
	if err != nil {
		return err
	}
	if len(hosts) > 0 {
		if len(hosts) != 1 || len(hosts[0].Hosts) != 1 || len(hosts[0].InboundIds) != 1 {
			return fmt.Errorf("inbound has multiple or shared hosts; edit them in the Hosts page to select the correct endpoint")
		}
		return database.GetDB().Model(&model.Host{}).Where("inbound_id = ? AND group_id = ?", id, hosts[0].GroupId).Update("address", address).Error
	}
	_, err = svc.AddHostGroup(&entity.HostGroup{InboundIds: []int{id}, Hosts: []string{address}, Remark: ib.Remark})
	return err
}
