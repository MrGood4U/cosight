package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	outputMu sync.Mutex
	debugMu  sync.Mutex
)

const (
	logLevelDebug = "DEBUG"
	logLevelInfo  = "INFO"
	logLevelError = "ERROR"
)

func newID(prefix string) string {
	var value [8]byte
	if _, err := rand.Read(value[:]); err == nil {
		return prefix + "_" + hex.EncodeToString(value[:])
	}
	return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
}

func nowString() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func emit(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	outputMu.Lock()
	defer outputMu.Unlock()
	_, _ = os.Stdout.Write(append(data, '\n'))
}

func emitBridgeError(message string) {
	appendLog(logLevelError, "bridge.error", map[string]any{"message": message})
	emit(map[string]any{"type": "bridge.error", "level": logLevelError, "message": message})
}

func appendDebugLog(kind string, fields map[string]any) {
	appendLog(logLevelDebug, kind, fields)
}

func appendInfoLog(kind string, fields map[string]any) {
	appendLog(logLevelInfo, kind, fields)
}

func appendErrorLog(kind string, fields map[string]any) {
	appendLog(logLevelError, kind, fields)
}

func appendLog(level, kind string, fields map[string]any) {
	if !shouldOutputLog(level) {
		return
	}
	logPath := strings.TrimSpace(os.Getenv("COSIGHT_DEBUG_LOG"))
	if logPath == "" {
		return
	}
	entry := map[string]any{
		"time":    nowString(),
		"level":   level,
		"kind":    kind,
		"payload": fields,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}

	debugMu.Lock()
	defer debugMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return
	}
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.Write(append(data, '\n'))
}

func durationMS(start time.Time) int64 {
	if start.IsZero() {
		return 0
	}
	return time.Since(start).Milliseconds()
}

func emitLog(message string, fields map[string]any) {
	level := logLevelForMessage(message)
	if !shouldOutputLog(level) {
		return
	}
	payload := map[string]any{"type": "harness.log", "level": level, "message": message}
	for key, value := range fields {
		payload[key] = value
	}
	appendLog(level, "harness."+message, fields)
	emit(payload)
}

// emitDebugLog records detailed diagnostics without treating them as a normal
// runtime event. It is also forwarded through stdout so Electron can put the
// same structured entry in its own log.
func emitDebugLog(message string, fields map[string]any) {
	if !shouldOutputLog(logLevelDebug) {
		return
	}
	payload := map[string]any{"type": "harness.log", "level": logLevelDebug, "message": message}
	for key, value := range fields {
		payload[key] = value
	}
	appendLog(logLevelDebug, "harness."+message, fields)
	emit(payload)
}

func logLevelForMessage(message string) string {
	lower := strings.ToLower(strings.TrimSpace(message))
	for _, marker := range []string{".error", ".failed", ".rejected", ".invalid", ".fallback", ".timeout", ".cancelled", ".unavailable", "_error", "_failed", "_rejected", "_invalid", "_timeout", "失败", "错误"} {
		if strings.Contains(lower, marker) {
			return logLevelError
		}
	}
	return logLevelInfo
}

func configuredOutputLogLevel() string {
	level := strings.ToUpper(strings.TrimSpace(os.Getenv("COSIGHT_LOG_LEVEL")))
	if level == logLevelDebug || level == logLevelInfo || level == logLevelError {
		return level
	}
	return logLevelDebug
}

func shouldOutputLog(level string) bool {
	ranks := map[string]int{logLevelDebug: 10, logLevelInfo: 20, logLevelError: 30}
	return ranks[level] >= ranks[configuredOutputLogLevel()]
}

func emitSignal(s signal) {
	appendInfoLog("harness.signal", map[string]any{
		"type":        s.Type,
		"eventId":     s.EventID,
		"sessionId":   s.SessionID,
		"createdAt":   s.CreatedAt,
		"payloadType": fmt.Sprintf("%T", s.Payload),
	})
	emit(map[string]any{"type": "harness.signal", "signal": s})
}

func sourceFor(module string, model modelProfile) map[string]any {
	return map[string]any{
		"module": module,
		"model":  model.Name,
	}
}
