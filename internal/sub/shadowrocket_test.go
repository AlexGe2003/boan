package sub

import (
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
)

func TestFilterShadowrocketLinks(t *testing.T) {
	reality := "vless://11111111-1111-1111-1111-111111111111@example.com:443?type=tcp&security=reality&fp=chrome#node"
	tlsLink := "vless://11111111-1111-1111-1111-111111111111@example.com:8443?type=tcp&security=tls#tls"
	vmessReality := "vmess://" + base64.StdEncoding.EncodeToString([]byte(`{"add":"example.com","port":443,"id":"u","tls":"reality","ps":"vm"}`))
	vmessTLS := "vmess://" + base64.StdEncoding.EncodeToString([]byte(`{"add":"example.com","port":443,"id":"u","tls":"tls","ps":"vm"}`))
	links := []string{reality, tlsLink, vmessReality, vmessTLS}

	t.Run("shadowrocket on 26.9.9 keeps non-reality", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "Shadowrocket/2.2.92", "", "26.9.9")
		if len(got) != 2 || got[0] != tlsLink || got[1] != vmessTLS {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("v2rayng keeps reality", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "v2rayNG/1.8.5", "", "26.9.9")
		if len(got) != len(links) || got[0] != reality {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("core 26.7.28 keeps reality for shadowrocket", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "Shadowrocket/2.2.92", "", "26.7.28")
		if len(got) != len(links) {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("empty core version keeps reality", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "Shadowrocket/2.2.92", "", "")
		if len(got) != len(links) {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("unknown core version keeps reality", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "Shadowrocket/2.2.92", "", "Unknown")
		if len(got) != len(links) {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("flag selects shadowrocket without the user agent", func(t *testing.T) {
		got := filterShadowrocketLinks(links, "curl/8.0", "shadowrocket", "v26.9.9")
		if len(got) != 2 || got[0] != tlsLink || got[1] != vmessTLS {
			t.Fatalf("links = %#v", got)
		}
	})

	t.Run("only reality becomes one notice", func(t *testing.T) {
		got := filterShadowrocketLinks([]string{reality, vmessReality}, "Shadowrocket/2.2.92", "", "26.10.0")
		if len(got) != 1 {
			t.Fatalf("links = %#v, want one notice", got)
		}
		parsed, err := url.Parse(got[0])
		if err != nil {
			t.Fatal(err)
		}
		if parsed.Scheme != "socks" || parsed.Host != "127.0.0.1:1080" {
			t.Fatalf("notice = %q", got[0])
		}
		remark, err := url.PathUnescape(parsed.Fragment)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(remark, "Shadowrocket") || !strings.Contains(remark, "REALITY") {
			t.Fatalf("remark = %q", remark)
		}
	})
}
