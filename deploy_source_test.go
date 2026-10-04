package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestSourceInstallerHelpAndSyntax(t *testing.T) {
	for _, path := range []string{"deploy/install-source.sh", "install.sh", "update.sh", "x-ui.sh"} {
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
