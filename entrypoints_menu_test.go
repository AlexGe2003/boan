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
	start := strings.Index(source, "\nentry_settings_menu() {")
	end := strings.Index(source[start:], "\ninstall() {") + start
	if end <= start {
		t.Fatal("cannot locate menu function block")
	}
	dir := t.TempDir()
	record := filepath.Join(dir, "args")
	if err = os.WriteFile(filepath.Join(dir, "x-ui"), []byte("#!/bin/bash\nprintf '%s\\n' \"$@\" >> \"$MENU_RECORD\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("bash", "-c", source[start:end]+"\nentry_settings_menu\n")
	cmd.Env = append(os.Environ(), "xui_folder="+dir, "MENU_RECORD="+record)
	cmd.Stdin = strings.NewReader("10\ntrue\n10\nfalse\n11\n127.0.0.1/32\n0\n")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("menu failed: %v %s", err, output)
	}
	got, err := os.ReadFile(record)
	if err != nil {
		t.Fatal(err)
	}
	want := "entry\n-block-domestic\ntrue\nentry\n-block-domestic\nfalse\nentry\n-trusted-proxies\n127.0.0.1/32\n"
	if string(got) != want {
		t.Fatalf("menu dispatched %q, want %q", got, want)
	}
}
