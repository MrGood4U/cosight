package main

import (
	"math"
	"sort"
	"sync"
)

const (
	latencySummaryEverySamples = 10
	maxLatencySamples          = 20000
)

// latencyMetrics stores stage-level timings for one Harness session. The
// samples are deliberately kept in memory only; the aggregate is written to
// the DEBUG log and is never exposed through the renderer UI.
type latencyMetrics struct {
	mu        sync.Mutex
	sessionID string
	samples   map[string][]int64
}

func newLatencyMetrics() *latencyMetrics {
	return &latencyMetrics{samples: make(map[string][]int64)}
}

func (h *harness) resetLatencyMetrics(sessionID string) {
	h.latency.mu.Lock()
	h.latency.sessionID = sessionID
	h.latency.samples = make(map[string][]int64)
	h.latency.mu.Unlock()
}

func (h *harness) recordLatency(module string, durationMS int64) {
	if module == "" || durationMS < 0 {
		return
	}
	h.latency.mu.Lock()
	samples := append(h.latency.samples[module], durationMS)
	if len(samples) > maxLatencySamples {
		samples = samples[len(samples)-maxLatencySamples:]
	}
	h.latency.samples[module] = samples
	totalSamples := 0
	for _, values := range h.latency.samples {
		totalSamples += len(values)
	}
	h.latency.mu.Unlock()

	if totalSamples > 0 && totalSamples%latencySummaryEverySamples == 0 {
		h.emitLatencySummary("periodic")
	}
}

func (h *harness) emitLatencySummary(reason string) {
	h.latency.mu.Lock()
	sessionID := h.latency.sessionID
	samples := make(map[string][]int64, len(h.latency.samples))
	for module, values := range h.latency.samples {
		samples[module] = append([]int64(nil), values...)
	}
	h.latency.mu.Unlock()
	if sessionID == "" {
		return
	}

	modules := make(map[string]any, 3)
	for _, module := range []string{"brain", "see", "speak"} {
		moduleSummary := latencySummaryFor(samples[module])
		moduleSummary["model"] = h.cfg.Models[module].Name
		modules[module] = moduleSummary
	}
	emitDebugLog("performance.latency.summary", map[string]any{
		"sessionId": sessionID,
		"reason":    reason,
		"stage":     "model_or_realtime",
		"modules":   modules,
	})
}

func latencySummaryFor(samples []int64) map[string]any {
	if len(samples) == 0 {
		return map[string]any{
			"sampleCount": 0,
			"averageMs":   0,
			"maxMs":       0,
			"p50Ms":       0,
			"p95Ms":       0,
		}
	}
	var total int64
	maximum := samples[0]
	for _, value := range samples {
		total += value
		if value > maximum {
			maximum = value
		}
	}
	return map[string]any{
		"sampleCount": len(samples),
		"averageMs":   math.Round((float64(total)/float64(len(samples)))*100) / 100,
		"maxMs":       maximum,
		"p50Ms":       latencyPercentile(samples, 0.50),
		"p95Ms":       latencyPercentile(samples, 0.95),
	}
}

// latencyPercentile uses the nearest-rank definition. This gives stable,
// easy-to-interpret values for small conversation samples (P50 of one sample
// is that sample; P95 of two samples is the larger sample).
func latencyPercentile(samples []int64, percentile float64) int64 {
	if len(samples) == 0 {
		return 0
	}
	sorted := append([]int64(nil), samples...)
	sort.Slice(sorted, func(left, right int) bool { return sorted[left] < sorted[right] })
	percentile = math.Max(0, math.Min(1, percentile))
	rank := int(math.Ceil(percentile * float64(len(sorted))))
	if rank < 1 {
		rank = 1
	}
	return sorted[rank-1]
}
