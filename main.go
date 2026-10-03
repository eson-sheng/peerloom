package main

import (
	"github.com/peerloom/server/cmd"
	pmode "github.com/peerloom/server/config/mode"
)

var (
	version    = "unknown"
	commitHash = "unknown"
	mode       = pmode.Dev
)

func main() {
	pmode.Set(mode)
	cmd.Run(version, commitHash)
}
