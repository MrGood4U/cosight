package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLatencyPercentilesUseNearestRankAndKeepInputOrder(t *testing.T) {
	samples := []int64{40, 10, 30, 20}
	if got := latencyPercentile(samples, 0.50); got != 20 {
		t.Fatalf("expected P50 to be 20ms, got %d", got)
	}
	if got := latencyPercentile(samples, 0.95); got != 40 {
		t.Fatalf("expected P95 to be 40ms, got %d", got)
	}
	if samples[0] != 40 {
		t.Fatalf("percentile calculation must not reorder the input: %v", samples)
	}
	if summary := latencySummaryFor(samples); summary["averageMs"] != 25.0 || summary["maxMs"] != int64(40) {
		t.Fatalf("unexpected latency aggregate: %#v", summary)
	}
}

func TestLatencySummaryIsDebugOnlyAndContainsAllStages(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "harness.log")
	t.Setenv("COSIGHT_DEBUG_LOG", logPath)

	h := newHarness()
	h.resetLatencyMetrics("session-metrics")
	for _, sample := range []int64{10, 20, 30, 40} {
		h.recordLatency("brain", sample)
	}
	h.emitLatencySummary("test")

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("failed to read structured log: %v", err)
	}
	var entry struct {
		Level   string         `json:"level"`
		Kind    string         `json:"kind"`
		Payload map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("failed to decode structured log: %v", err)
	}
	if entry.Level != logLevelDebug || entry.Kind != "harness.performance.latency.summary" {
		t.Fatalf("latency summary must be a DEBUG log, got level=%q kind=%q", entry.Level, entry.Kind)
	}
	modules, ok := entry.Payload["modules"].(map[string]any)
	if !ok {
		t.Fatalf("latency summary has no modules: %#v", entry.Payload)
	}
	for _, module := range []string{"brain", "see", "speak"} {
		if _, ok := modules[module]; !ok {
			t.Fatalf("latency summary missing %s module: %#v", module, modules)
		}
	}
}
