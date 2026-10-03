package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
	"github.com/peerloom/server/config/mode"
)

func TestCapacityConfigFilePrecedence(t *testing.T) {
	oldMode := mode.Get()
	t.Cleanup(func() { mode.Set(oldMode) })
	for _, key := range []string{"PEERLOOM_MAX_ROOM_MEMBERS", "PEERLOOM_MAX_MEDIA_SEATS"} {
		value, exists := os.LookupEnv(key)
		t.Cleanup(func() {
			if exists {
				os.Setenv(key, value)
			} else {
				os.Unsetenv(key)
			}
		})
	}
	dir := t.TempDir()
	for name, contents := range map[string]string{
		"peerloom.config":             "PEERLOOM_MAX_ROOM_MEMBERS=12\nPEERLOOM_MAX_MEDIA_SEATS=12\n",
		"peerloom.config.development": "PEERLOOM_MAX_MEDIA_SEATS=6\n",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		name string
		mode string
		env  string
		want int
	}{
		{"production ignores development", mode.Prod, "", 12},
		{"development explicit override", mode.Dev, "", 6},
		{"environment overrides files", mode.Prod, "9", 9},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mode.Set(tc.mode)
			os.Unsetenv("PEERLOOM_MAX_ROOM_MEMBERS")
			os.Unsetenv("PEERLOOM_MAX_MEDIA_SEATS")
			if tc.env != "" {
				os.Setenv("PEERLOOM_MAX_MEDIA_SEATS", tc.env)
			}
			for _, file := range getFiles(dir) {
				if filepath.Dir(file) != dir {
					continue
				}
				if _, err := os.Stat(file); os.IsNotExist(err) {
					continue
				}
				if err := godotenv.Load(file); err != nil {
					t.Fatal(err)
				}
			}
			var c Config
			if err := envconfig.Process(prefix, &c); err != nil {
				t.Fatal(err)
			}
			if c.MaxRoomMembers != 12 || c.MaxMediaSeats != tc.want {
				t.Fatalf("capacity=%d/%d, want 12/%d", c.MaxRoomMembers, c.MaxMediaSeats, tc.want)
			}
		})
	}
}
