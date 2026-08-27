package main

import (
	"testing"
	"time"
)

func waitForCondition(t *testing.T, description string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", description)
}

func historySnapshot(h *harness) []conversationMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]conversationMessage(nil), h.history...)
}
