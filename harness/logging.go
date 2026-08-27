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
	appendDebugLog("bridge.error", map[string]any{"message": message})
	emit(map[string]any{"type": "bridge.error", "message": message})
}

func appendDebugLog(kind string, fields map[string]any) {
	logPath := strings.TrimSpace(os.Getenv("COSIGHT_DEBUG_LOG"))
	if logPath == "" {
		return
	}
	entry := map[string]any{
		"time":    nowString(),
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
	payload := map[string]any{"type": "harness.log", "message": message}
	for key, value := range fields {
		payload[key] = value
	}
	appendDebugLog("harness."+message, fields)
	emit(payload)
}

func emitSignal(s signal) {
	appendDebugLog("harness.signal", map[string]any{
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
