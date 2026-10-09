package sub

import "strings"

func realityClientFingerprint(settings map[string]any) string {
	fingerprint, _ := settings["fingerprint"].(string)
	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" || strings.EqualFold(fingerprint, "unsafe") {
		return "chrome"
	}
	return fingerprint
}
