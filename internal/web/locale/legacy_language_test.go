package locale

import (
	"os"
	"testing"
)

type legacyBotLanguage struct{}

func (legacyBotLanguage) GetTgLang() (string, error) { return "fa-IR", nil }

func TestRemovedLanguagesFallBackToEnglish(t *testing.T) {
	if err := InitLocalizer(os.DirFS(".."), legacyBotLanguage{}); err != nil {
		t.Fatal(err)
	}
	key := "tgbot.buttons.resetTraffic"
	want := I18nForLang("en-US", key)
	if want == key || want == "" {
		t.Fatal("English translation not loaded")
	}
	for _, lang := range []string{"fa-IR", "ru-RU", "ar-EG"} {
		if got := I18nForLang(lang, key); got != want {
			t.Errorf("%s = %q, want English %q", lang, got, want)
		}
	}
	if got := I18n(Bot, key); got != want {
		t.Errorf("legacy bot language = %q, want English %q", got, want)
	}
}
