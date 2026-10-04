package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEntryConfigurationAndSubscription(t *testing.T) {
	setupSettingTestDB(t)
	s := &SettingService{}
	if err := s.SetBasePath("/control/"); err != nil {
		t.Fatal(err)
	}
	p := EntryPoints{AdminURL: "https://admin.example.com/control/", UserURL: "https://user.example.com/control/", UserEnabled: true}
	if err := s.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []EntryPoints{
		{UserEnabled: false},
		{AdminURL: p.AdminURL, UserEnabled: true},
		{AdminURL: p.AdminURL, UserURL: p.AdminURL, UserEnabled: true},
		{AdminURL: p.AdminURL, UserURL: "https://user.example.com/wrong/", UserEnabled: true},
		{AdminURL: p.AdminURL, UserURL: "https://u:p@user.example.com/control/", UserEnabled: true},
	} {
		if err := s.SaveEntryPoints(bad); err == nil {
			t.Fatalf("accepted %+v", bad)
		}
	}
	got, err := s.GetEntryPoints()
	if err != nil || got != p {
		t.Fatalf("invalid write changed settings: %+v %v", got, err)
	}
	rawPath, _ := s.GetSubPath()
	jsonPath, _ := s.GetSubJsonPath()
	clashPath, _ := s.GetSubClashPath()
	if err := s.ConfigureSubscriptionOrigin("https://sub.example.com:8444", "", ""); err != nil {
		t.Fatal(err)
	}
	for key, path := range map[string]string{"subURI": rawPath, "subJsonURI": jsonPath, "subClashURI": clashPath} {
		got, err := s.getString(key)
		if err != nil || got != "https://sub.example.com:8444"+path {
			t.Fatalf("%s: %s %v", key, got, err)
		}
	}
	if err := s.ConfigureSubscriptionOrigin("https://admin.example.com", "", ""); err == nil {
		t.Fatal("accepted conflicting subscription host")
	}
	p.UserEnabled = false
	if err := s.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	if p.Allows("user.example.com", false) || p.Allows("admin.example.com", false) || !p.Allows("ADMIN.example.com:443", true) {
		t.Fatal("wrong closed-portal policy")
	}
}

func entryTestCertificate(t *testing.T, host string, expires time.Time) (string, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	leaf := &x509.Certificate{SerialNumber: big.NewInt(1), DNSNames: []string{host}, NotBefore: time.Now().Add(-time.Hour), NotAfter: expires, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, leaf, leaf, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	certPath, keyPath := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if err = os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0600); err != nil {
		t.Fatal(err)
	}
	return certPath, keyPath
}

func TestEntryCertificatesAndSNI(t *testing.T) {
	setupSettingTestDB(t)
	s := &SettingService{}
	if err := s.SetBasePath("/"); err != nil {
		t.Fatal(err)
	}
	adminCert, adminKey := entryTestCertificate(t, "admin.example.com", time.Now().Add(time.Hour))
	userCert, userKey := entryTestCertificate(t, "user.example.com", time.Now().Add(time.Hour))
	for _, test := range []struct{ cert, key, host string }{{adminCert, userKey, "admin.example.com"}, {adminCert, adminKey, "user.example.com"}} {
		if _, err := ValidateEntryCertificate(test.cert, test.key, test.host); err == nil {
			t.Fatal("accepted wrong certificate")
		}
	}
	expired, key := entryTestCertificate(t, "admin.example.com", time.Now().Add(-time.Minute))
	if _, err := ValidateEntryCertificate(expired, key, "admin.example.com"); err == nil {
		t.Fatal("accepted expired certificate")
	}
	p := EntryPoints{AdminURL: "https://admin.example.com", UserURL: "https://user.example.com", UserEnabled: true, AdminCert: adminCert, AdminKey: adminKey, UserCert: userCert, UserKey: userKey}
	if err := s.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	cfg, err := s.EntryTLSConfig()
	if err != nil {
		t.Fatal(err)
	}
	for _, host := range []string{"admin.example.com", "user.example.com"} {
		cert, err := cfg.GetCertificate(&tls.ClientHelloInfo{ServerName: host})
		if err != nil || cert.Leaf.VerifyHostname(host) != nil {
			t.Fatalf("wrong SNI cert for %s: %v", host, err)
		}
	}
	if _, err := cfg.GetCertificate(&tls.ClientHelloInfo{ServerName: "other.example.com"}); err == nil {
		t.Fatal("accepted unknown SNI")
	}
	if err := os.Remove(userKey); err != nil {
		t.Fatal(err)
	}
	if _, err := s.EntryTLSConfig(); err == nil {
		t.Fatal("missing key did not fail closed")
	}
}
