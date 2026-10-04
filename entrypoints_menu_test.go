package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestEntryShellMenuDispatch(t *testing.T) {
	data, err := os.ReadFile("x-ui.sh")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	for _, name := range []string{"entry_settings_menu", "before_show_menu", "show_menu"} {
		if strings.Count(source, "\n"+name+"() {") != 1 {
			t.Fatalf("missing or duplicate menu function %s", name)
		}
	}
	start := strings.Index(source, "\nread_value() {")
	end := strings.Index(source[start:], "\ninstall() {") + start
	if start < 0 || end <= start {
		t.Fatal("cannot locate menu functions")
	}
	for _, tc := range []struct{ name, input, want string }{
		{"toggle and proxy", "2\n2\ntrue\ny\n2\nn\n3\n\n3\n-\n0\n0\n", "entry\n-block-domestic\ntrue\nentry\n-block-domestic\nfalse\nentry\n-trusted-proxies\n127.0.0.1/32\nentry\n-trusted-proxies\n\n"},
		{"keep live defaults", "2\n1\n\n2\n\n4\n\n0\n0\n", "entry\n-user-enabled\ntrue\nentry\n-block-domestic\nfalse\n"},
		{"EOF does not change config", "2\n1\n", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			record := filepath.Join(dir, "args")
			mock := `#!/bin/bash
if [[ "$2" == -value ]]; then
 case "$3" in user-enabled) echo true ;; block-domestic) echo false ;; trusted-proxies) echo 127.0.0.1/32 ;; esac
 exit 0
fi
printf '%s\n' "$@" >> "$MENU_RECORD"
`
			if err = os.WriteFile(filepath.Join(dir, "x-ui"), []byte(mock), 0700); err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("bash", "-c", source[start:end]+"\nentry_settings_menu\n")
			cmd.Env = append(os.Environ(), "xui_folder="+dir, "MENU_RECORD="+record)
			cmd.Stdin = strings.NewReader(tc.input)
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("menu failed: %v %s", err, output)
			}
			got, err := os.ReadFile(record)
			if os.IsNotExist(err) && tc.want == "" {
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.want {
				t.Fatalf("dispatched %q, want %q", got, tc.want)
			}
		})
	}
}

func TestMainMenuRoutesToEntryControls(t *testing.T) {
	data, err := os.ReadFile("x-ui.sh")
	if err != nil {
		t.Fatal(err)
	}
	s := string(data)
	start := strings.Index(s, "\nread_value() {")
	end := strings.Index(s[start:], "\ninstall() {") + start
	mainStart := strings.Index(s, "\nmenu_autostart() {")
	mainEnd := strings.Index(s[mainStart:], "\nif [[ $# > 0 ]]; then") + mainStart
	code := s[start:end] + s[mainStart:mainEnd] + `\n`
	code = strings.TrimSuffix(code, `\n`) + "\nshow_status() { :; }\nentry_user_access() { echo USER_ACCESS_CALLED; }\nshow_menu\n"
	cmd := exec.Command("bash", "-c", code)
	cmd.Stdin = strings.NewReader("3\n1\n0\n0\n")
	output, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(output), "USER_ACCESS_CALLED") {
		t.Fatalf("main route: %v %s", err, output)
	}
}
