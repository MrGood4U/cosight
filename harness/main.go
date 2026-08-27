package main

// main is intentionally kept as a tiny process entrypoint. Runtime protocol
// handling lives in commands.go, while the Harness responsibilities are split
// by lifecycle, transport, listen, see, brain, and model-client concerns.
func main() {
	runHarnessProcess()
}
