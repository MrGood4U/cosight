package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStructuredLogHelpersWriteExplicitLevels(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "harness.log")
	t.Setenv("COSIGHT_DEBUG_LOG", logPath)
	appendInfoLog("session.ready", map[string]any{"sessionId": "session-log"})
	appendErrorLog("brain.failed", map[string]any{"message": "mock failure"})
	appendDebugLog("conversation.content", map[string]any{"role": "user", "text": "hello"})

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("failed to read structured log: %v", err)
	}
	lines := make([]map[string]any, 0)
	for _, rawLine := range splitLogLines(data) {
		var entry map[string]any
		if err := json.Unmarshal(rawLine, &entry); err != nil {
			t.Fatalf("failed to decode log line: %v", err)
		}
		lines = append(lines, entry)
	}
	if len(lines) != 3 {
		t.Fatalf("expected three structured log lines, got %d", len(lines))
	}
	if lines[0]["level"] != logLevelInfo || lines[1]["level"] != logLevelError || lines[2]["level"] != logLevelDebug {
		t.Fatalf("unexpected log levels: %#v", lines)
	}
}

func splitLogLines(data []byte) [][]byte {
	lines := make([][]byte, 0)
	for len(data) > 0 {
		index := 0
		for index < len(data) && data[index] != '\n' {
			index++
		}
		if index > 0 {
			lines = append(lines, data[:index])
		}
		if index == len(data) {
			break
		}
		data = data[index+1:]
	}
	return lines
}
