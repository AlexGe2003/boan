package sub

import (
	"encoding/base64"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

// shadowrocketRealityRemark is the node name Shadowrocket shows when every
// link in the subscription was REALITY on a core that rejects its handshake.
const shadowrocketRealityRemark = "Shadowrocket cannot use REALITY on this server. Add a TLS, VMess, Trojan, or Hysteria2 node."

// filterShadowrocketLinks drops REALITY links for Shadowrocket when the running
// core is Xray 26.9.8+, which rejects ClientHellos without X25519MLKEM768.
func filterShadowrocketLinks(links []string, userAgent, flag, coreVersion string) []string {
	if !shadowrocketRequest(userAgent, flag) || !coreRequiresMLKEM(coreVersion) {
		return links
	}
	kept := make([]string, 0, len(links))
	dropped := 0
	for _, link := range links {
		if linkIsReality(link) {
			dropped++
			continue
		}
		kept = append(kept, link)
	}
	if dropped > 0 && len(kept) == 0 {
		return []string{shadowrocketNoticeLink()}
	}
	return kept
}

func shadowrocketRequest(userAgent, flag string) bool {
	if strings.EqualFold(strings.TrimSpace(flag), "shadowrocket") {
		return true
	}
	return strings.Contains(strings.ToLower(userAgent), "shadowrocket")
}

func shadowrocketCoreVersion() string {
	process := service.XrayProcess()
	if process == nil {
		return ""
	}
	return process.GetXrayVersion()
}

func coreRequiresMLKEM(version string) bool {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	version = strings.TrimPrefix(version, "V")
	parts := strings.Split(version, ".")
	if len(parts) < 3 {
		return false
	}
	major, err1 := strconv.Atoi(parts[0])
	minor, err2 := strconv.Atoi(parts[1])
	patch, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return false
	}
	if major != 26 {
		return major > 26
	}
	if minor != 9 {
		return minor > 9
	}
	return patch >= 8
}

func linkIsReality(link string) bool {
	raw := strings.TrimSpace(link)
	if raw == "" {
		return false
	}
	if strings.HasPrefix(strings.ToLower(raw), "vmess://") {
		return vmessLinkIsReality(raw)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Query().Get("security"), "reality")
}

func vmessLinkIsReality(link string) bool {
	payload := link[len("vmess://"):]
	if i := strings.IndexAny(payload, "?#"); i >= 0 {
		payload = payload[:i]
	}
	decoded, err := base64.StdEncoding.DecodeString(padBase64(payload))
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(payload, "="))
		if err != nil {
			return false
		}
	}
	var obj map[string]any
	if json.Unmarshal(decoded, &obj) != nil {
		return false
	}
	tls, _ := obj["tls"].(string)
	return strings.EqualFold(tls, "reality")
}

func padBase64(s string) string {
	if pad := len(s) % 4; pad != 0 {
		s += strings.Repeat("=", 4-pad)
	}
	return s
}

func shadowrocketNoticeLink() string {
	remark := strings.ReplaceAll(url.QueryEscape(shadowrocketRealityRemark), "+", "%20")
	return "socks://127.0.0.1:1080#" + remark
}
