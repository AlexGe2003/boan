package locale

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
)

func TestTranslationFilesLoadAtStartup(t *testing.T) {
	bundle := i18n.NewBundle(language.English)
	bundle.RegisterUnmarshalFunc("json", json.Unmarshal)
	if err := parseTranslationFiles(os.DirFS(".."), bundle); err != nil {
		t.Fatalf("translations must load before the web server can start: %v", err)
	}
}
