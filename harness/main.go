package main

import "os"

// main is intentionally kept as a tiny process entrypoint. Runtime protocol
// handling lives in commands.go, while the Harness responsibilities are split
// by lifecycle, transport, listen, see, brain, and model-client concerns.
func main() {
	if len(os.Args) > 1 && os.Args[1] == "--test-connection" {
		runModelConnectionTest()
		return
	}
	runHarnessProcess()
}
