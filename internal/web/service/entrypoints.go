package service

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// EntryPoints is CLI-managed so a routine settings form cannot erase access policy.
type EntryPoints struct {
	AdminURL    string `json:"adminURL"`
	UserURL     string `json:"userURL"`
	UserEnabled bool   `json:"userEnabled"`
	AdminCert   string `json:"adminCert,omitempty"`
	AdminKey    string `json:"adminKey,omitempty"`
	UserCert    string `json:"userCert,omitempty"`
	UserKey     string `json:"userKey,omitempty"`
}

func (s *SettingService) GetEntryPoints() (EntryPoints, error) {
	p := EntryPoints{UserEnabled: true}
	row, err := s.getSetting("entryPoints")
	if database.IsNotFound(err) {
		return p, nil
	}
	if err != nil {
		return p, err
	}
	err = json.Unmarshal([]byte(row.Value), &p)
	return p, err
}

func EntryHost(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
}

func RequestHost(raw string) string {
	if host, _, err := net.SplitHostPort(raw); err == nil {
		raw = host
	}
	return strings.ToLower(strings.TrimSuffix(strings.Trim(raw, "[]"), "."))
}

func ValidateEntryURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(u.Host, " \\\t\r\n") {
		return nil, fmt.Errorf("invalid HTTP(S) URL: %q", raw)
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return nil, fmt.Errorf("invalid URL port")
		}
	}
	host := u.Hostname()
	if net.ParseIP(host) == nil {
		if len(host) > 253 {
			return nil, fmt.Errorf("hostname is too long")
		}
		for _, label := range strings.Split(strings.TrimSuffix(host, "."), ".") {
			if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
				return nil, fmt.Errorf("invalid hostname")
			}
			for _, ch := range label {
				if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') && ch != '-' {
					return nil, fmt.Errorf("invalid hostname")
				}
			}
		}
	}
	return u, nil
}

func ValidateEntryCertificate(certPath, keyPath, host string) (*tls.Certificate, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, err
	}
	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		return nil, err
	}
	if err = leaf.VerifyHostname(host); err != nil {
		return nil, err
	}
	now := time.Now()
	if now.Before(leaf.NotBefore) || !now.Before(leaf.NotAfter) {
		return nil, fmt.Errorf("certificate for %s is not currently valid", host)
	}
	cert.Leaf = leaf
	return &cert, nil
}

func (s *SettingService) SaveEntryPoints(p EntryPoints) error {
	if (p.AdminURL == "") != (p.UserURL == "") {
		return fmt.Errorf("set admin-url and user-url together")
	}
	if p.AdminURL == "" && !p.UserEnabled {
		return fmt.Errorf("configure separate admin and user URLs before closing the user website")
	}
	previous, err := s.GetEntryPoints()
	if err != nil && p.AdminURL != "" {
		return err
	}
	subDomain, err := s.GetSubDomain()
	if err != nil {
		return err
	}
	if p.AdminURL != "" && subDomain != "" && (RequestHost(subDomain) == EntryHost(p.AdminURL) || RequestHost(subDomain) == EntryHost(p.UserURL)) {
		return fmt.Errorf("website domains must differ from the subscription domain")
	}
	base, err := s.GetBasePath()
	if err != nil {
		return err
	}
	for _, raw := range []string{p.AdminURL, p.UserURL} {
		if raw == "" {
			continue
		}
		u, err := ValidateEntryURL(raw)
		if err != nil {
			return err
		}
		if strings.TrimRight(u.Path, "/") != strings.TrimRight(base, "/") {
			return fmt.Errorf("URL must use the configured panel base path %s", base)
		}
	}
	if p.AdminURL != "" && EntryHost(p.AdminURL) == EntryHost(p.UserURL) {
		return fmt.Errorf("admin and user domains must differ")
	}
	for _, item := range []struct{ cert, key, raw, oldCert, oldKey, oldURL string }{
		{p.AdminCert, p.AdminKey, p.AdminURL, previous.AdminCert, previous.AdminKey, previous.AdminURL},
		{p.UserCert, p.UserKey, p.UserURL, previous.UserCert, previous.UserKey, previous.UserURL},
	} {
		if item.cert == "" && item.key == "" {
			continue
		}
		if item.raw == "" {
			return fmt.Errorf("configure the entry URL before its certificate")
		}
		if item.cert == item.oldCert && item.key == item.oldKey && item.raw == item.oldURL {
			continue
		}
		if _, err := ValidateEntryCertificate(item.cert, item.key, EntryHost(item.raw)); err != nil {
			return err
		}
	}
	encoded, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return s.saveSetting("entryPoints", string(encoded))
}

func (p EntryPoints) Allows(host string, admin bool) bool {
	if p.AdminURL == "" {
		return true
	}
	if admin {
		return RequestHost(host) == EntryHost(p.AdminURL)
	}
	return p.UserEnabled && RequestHost(host) == EntryHost(p.UserURL)
}

// EntryTLSConfig loads both SNI certificates before opening a listener. Empty
// per-entry paths may use an existing panel certificate covering both domains.
func (s *SettingService) EntryTLSConfig() (*tls.Config, error) {
	p, err := s.GetEntryPoints()
	if err != nil {
		return nil, err
	}
	if p.AdminURL == "" {
		return nil, nil
	}
	fallbackCert, err := s.GetCertFile()
	if err != nil {
		return nil, err
	}
	fallbackKey, err := s.GetKeyFile()
	if err != nil {
		return nil, err
	}
	if p.AdminCert == "" && p.UserCert == "" && fallbackCert == "" && fallbackKey == "" {
		return nil, nil
	} // TLS may terminate at a reverse proxy.
	certs := map[string]*tls.Certificate{}
	for _, item := range []struct{ cert, key, raw string }{{p.AdminCert, p.AdminKey, p.AdminURL}, {p.UserCert, p.UserKey, p.UserURL}} {
		if item.cert == "" {
			item.cert, item.key = fallbackCert, fallbackKey
		}
		host := EntryHost(item.raw)
		cert, err := ValidateEntryCertificate(item.cert, item.key, host)
		if err != nil {
			return nil, fmt.Errorf("TLS for %s: %w", host, err)
		}
		certs[host] = cert
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
		if cert := certs[RequestHost(hello.ServerName)]; cert != nil {
			return cert, nil
		}
		return nil, fmt.Errorf("unknown TLS server name")
	}}, nil
}

// ConfigureSubscriptionOrigin preserves the existing subscription token paths.
func (s *SettingService) ConfigureSubscriptionOrigin(raw, certPath, keyPath string) error {
	values := map[string]string{}
	if raw != "" {
		u, err := ValidateEntryURL(raw)
		if err != nil {
			return err
		}
		if u.Path != "" && u.Path != "/" {
			return fmt.Errorf("subscription URL must be an origin without a path; existing subscription paths are preserved")
		}
		p, err := s.GetEntryPoints()
		if err != nil {
			return err
		}
		if EntryHost(raw) == EntryHost(p.AdminURL) || EntryHost(raw) == EntryHost(p.UserURL) {
			return fmt.Errorf("subscription domain must differ from website domains")
		}
		for key, getPath := range map[string]func() (string, error){"subURI": s.GetSubPath, "subJsonURI": s.GetSubJsonPath, "subClashURI": s.GetSubClashPath} {
			path, err := getPath()
			if err != nil {
				return err
			}
			values[key] = strings.TrimRight(raw, "/") + path
		}
		values["subDomain"] = u.Hostname()
	}
	if certPath != "" || keyPath != "" {
		host, err := s.GetSubDomain()
		if err != nil {
			return err
		}
		if raw != "" {
			host = EntryHost(raw)
		}
		if host == "" {
			return fmt.Errorf("configure subscription URL first")
		}
		if _, err := ValidateEntryCertificate(certPath, keyPath, host); err != nil {
			return err
		}
		values["subCertFile"], values["subKeyFile"] = certPath, keyPath
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
