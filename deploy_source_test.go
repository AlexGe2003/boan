package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestSourceInstallerHelpAndSyntax(t *testing.T) {
	for _, path := range []string{"deploy/update-source.sh", "deploy/install-source.sh", "install.sh", "update.sh", "x-ui.sh"} {
		if out, err := exec.Command("bash", "-n", path).CombinedOutput(); err != nil {
			t.Fatalf("%s: %v %s", path, err, out)
		}
	}
	output, err := exec.Command("bash", "deploy/install-source.sh", "--help").CombinedOutput()
	if err != nil || !strings.Contains(string(output), "Existing x-ui installations are refused") {
		t.Fatalf("help: %v %s", err, output)
	}
	// Sourcing must only define helpers, never invoke apt or modify this host.
	output, err = exec.Command("bash", "-c", "source deploy/install-source.sh; declare -F install_source").CombinedOutput()
	if err != nil || !strings.Contains(string(output), "install_source") {
		t.Fatalf("source: %v %s", err, output)
	}
}

func TestBoanInstallAndUpdateOrigins(t *testing.T) {
	for _, path := range []string{"install.sh", "update.sh", "x-ui.sh", "internal/web/service/panel/panel.go"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := strings.ToLower(string(data))
		for _, prefix := range []string{"https://raw.githubusercontent.com/", "https://api.github.com/repos/", "https://github.com/"} {
			if strings.Contains(text, prefix+"mhsanaei/3x-ui") {
				t.Errorf("%s still downloads upstream panel code", path)
			}
		}
		if !strings.Contains(text, "alexge2003/boan") {
			t.Errorf("%s has no fork download source", path)
		}
	}
}

func TestSourceUpgradeRestoresProgramAndDatabase(t *testing.T) {
	root := t.TempDir()
	for _, dir := range []string{"backup/data", "app", "data", "bin"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for path, content := range map[string]string{
		"backup/x-ui": "old-binary", "backup/menu.sh": "old-menu", "backup/source-commit": "old-commit",
		"backup/data/x-ui.db": "old-database", "app/x-ui": "new-binary", "app/source-commit": "new-commit",
		"app/node-settings": "keep-node-settings", "data/x-ui.db": "migrated-database", "data/new-file": "new-state", "bin/x-ui": "new-menu",
	} {
		if err := os.WriteFile(filepath.Join(root, path), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	cmd := exec.Command("bash", "-c", `source deploy/update-source.sh; upgrade_restore_files "$1/backup" "$1/app" "$1/data" "$1/bin/x-ui"`, "test", root)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("restore: %v %s", err, out)
	}
	for path, want := range map[string]string{"app/x-ui": "old-binary", "bin/x-ui": "old-menu", "app/source-commit": "old-commit", "data/x-ui.db": "old-database", "backup/failed-data/x-ui.db": "migrated-database", "app/node-settings": "keep-node-settings"} {
		got, err := os.ReadFile(filepath.Join(root, path))
		if err != nil || string(got) != want {
			t.Fatalf("%s: %s %v", path, got, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "data/new-file")); !os.IsNotExist(err) {
		t.Fatal("failed migration state leaked into restored database directory")
	}
}
