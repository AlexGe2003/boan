package sub

import "testing"

func TestRealityExportsAlwaysUseBrowserFingerprint(t *testing.T) {
	for _, tc := range []struct{ configured, want string }{
		{"", "chrome"}, {"   ", "chrome"}, {"unsafe", "chrome"}, {"chrome", "chrome"}, {"firefox", "firefox"},
	} {
		settings := map[string]any{"fingerprint": tc.configured, "publicKey": "public-key"}
		reality := map[string]any{"settings": settings, "serverNames": []any{"example.com"}, "shortIds": []any{"ab12"}}
		params := map[string]string{}
		applyShareRealityParams(map[string]any{"realitySettings": reality}, params, "client")
		json := (&SubJsonService{}).realityData(reality, "client")
		clash := (&SubClashService{}).realityData(reality)
		for format, got := range map[string]any{"share": params["fp"], "json": json["fingerprint"], "clash": clash["fingerprint"]} {
			if got != tc.want {
				t.Errorf("%s %q: %v want %q", format, tc.configured, got, tc.want)
			}
		}
	}
}
