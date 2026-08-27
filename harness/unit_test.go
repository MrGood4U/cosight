package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseBrainActionKeepsSemanticDrawAction(t *testing.T) {
	action, err := parseBrainAction(`{"actions":[{"actionId":"speak-1","type":"speak","text":"我来标记它"},{"actionId":"draw-1","type":"draw","operation":"CIRCLE","target":{"bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.4}}}]}`, "session-1", "listen-1", "see-1")
	if err != nil {
		t.Fatalf("parseBrainAction failed: %v", err)
	}
	if len(action.Actions) != 2 || action.Actions[1].Operation != "circle" {
		t.Fatalf("expected normalized semantic draw action, got %+v", action.Actions)
	}
	if action.ReplyTo.ListenEventID != "listen-1" || action.ReplyTo.SeeEventID != "see-1" {
		t.Fatalf("unexpected action reply metadata: %+v", action.ReplyTo)
	}
}

func TestRequestSeeJoinsExistingAnalysis(t *testing.T) {
	h := newHarness()
	future := newSeeFuture()
	future.requestID = "see-request-existing"
	future.requestedAt = time.Now()
	h.stateMu.Lock()
	h.seeAnalyzing = future
	h.stateMu.Unlock()

	joined := h.requestSee("unit_test")
	if joined != future {
		t.Fatalf("expected new See request to join the existing analysis")
	}
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	if h.seeInFlight != nil {
		t.Fatal("joining an in-flight See analysis must not create another capture request")
	}
}

func TestExecuteDrawWaitsForRendererResultWithoutRetry(t *testing.T) {
	h := newHarness()
	h.cfg.SessionID = "session-draw"
	h.cfg.DrawingEnabled = true
	done := make(chan struct{})
	go func() {
		h.executeDraw(brainAction{
			ActionID:  "draw-unit",
			Type:      "draw",
			Operation: "arrow",
			Target:    map[string]any{"from": map[string]any{"x": 0.1, "y": 0.1}, "to": map[string]any{"x": 0.8, "y": 0.8}},
		})
		close(done)
	}()
	waitForCondition(t, "unit draw action", func() bool {
		h.actionMu.Lock()
		defer h.actionMu.Unlock()
		_, ok := h.pendingActions["draw-unit"]
		return ok
	})
	h.receiveActionResult("draw-unit", actionResult{OK: true, Result: json.RawMessage(`{"ok":true}`)})
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("draw action did not finish after renderer result")
	}
	h.actionMu.Lock()
	defer h.actionMu.Unlock()
	if _, ok := h.pendingActions["draw-unit"]; ok {
		t.Fatal("completed draw action should be removed from pending actions")
	}
}

func TestNormalizeModelUsageSupportsSnakeCaseProviderFields(t *testing.T) {
	usage, err := json.Marshal(map[string]any{
		"prompt_tokens":     12,
		"completion_tokens": 8,
	})
	if err != nil {
		t.Fatalf("failed to encode usage: %v", err)
	}
	parsed := normalizeModelUsage(usage)
	if parsed["inputTokens"] != int64(12) || parsed["outputTokens"] != int64(8) || parsed["totalTokens"] != int64(20) {
		t.Fatalf("unexpected normalized usage: %+v", parsed)
	}
}

func TestStartSkipsASRWhenListeningIsDisabled(t *testing.T) {
	h := newHarness()
	config := startConfig{
		SessionID: "session-no-listen",
		Models: map[string]modelProfile{
			"brain":  {Name: "brain", URL: "http://127.0.0.1:1/v1", APIKey: "mock"},
			"listen": {Name: "listen", URL: "ws://127.0.0.1:1", APIKey: "mock"},
			"speak":  {Name: "speak", URL: "ws://127.0.0.1:1", APIKey: "mock"},
			"see":    {Name: "see", URL: "http://127.0.0.1:1/v1", APIKey: "mock"},
		},
		ListeningEnabled:    false,
		SpeakingEnabled:     false,
		ScreenVisionEnabled: false,
	}
	if err := h.start(config); err != nil {
		t.Fatalf("Harness should start without ASR when listening is disabled: %v", err)
	}
	defer h.stop()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.asr != nil {
		t.Fatal("ASR client must not be created when listening is disabled")
	}
}

func TestAppendAudioIsNoopWhenListeningIsDisabled(t *testing.T) {
	h := newHarness()
	h.cfg.ListeningEnabled = false
	if err := h.appendAudio("mock-audio"); err != nil {
		t.Fatalf("audio should be ignored when listening is disabled: %v", err)
	}
}

func TestExecuteSpeakSkipsTTSWhenSpeakingIsDisabled(t *testing.T) {
	h := newHarness()
	h.cfg.SessionID = "session-no-speak"
	h.cfg.SpeakingEnabled = false
	h.cfg.Models = map[string]modelProfile{
		"speak": {Name: "speak", URL: "invalid://must-not-be-dialed", APIKey: "mock"},
	}

	h.executeAction(brainAction{ActionID: "speak-disabled", Type: "speak", Text: "这条文字仍然可以显示"})
	history := historySnapshot(h)
	if len(history) != 1 || history[0].Role != "assistant" || history[0].Text != "这条文字仍然可以显示" {
		t.Fatalf("disabled speech should keep text output without TTS: %+v", history)
	}
}
