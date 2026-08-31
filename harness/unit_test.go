package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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

func TestNormalizeModelUsageReadsNestedReasoningTokens(t *testing.T) {
	usage, err := json.Marshal(map[string]any{
		"prompt_tokens":     12,
		"completion_tokens": 8,
		"completion_tokens_details": map[string]any{
			"reasoning_tokens": 5,
		},
	})
	if err != nil {
		t.Fatalf("failed to encode usage: %v", err)
	}
	parsed := normalizeModelUsage(usage)
	if parsed["reasoningTokens"] != int64(5) {
		t.Fatalf("expected nested reasoning token count, got %+v", parsed)
	}
}

func TestCallJSONModelCapturesReasoningDetailsAtDebug(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "harness.log")
	t.Setenv("COSIGHT_DEBUG_LOG", logPath)
	t.Setenv("COSIGHT_LOG_LEVEL", logLevelDebug)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    "response-1",
			"model": "mock-brain",
			"choices": []any{map[string]any{
				"finish_reason": "stop",
				"message": map[string]any{
					"content":           `{"actions":[{"type":"speak","text":"回答"}]}`,
					"reasoning_content": "先判断问题，再组织回答。",
				},
			}},
			"usage": map[string]any{
				"prompt_tokens":     10,
				"completion_tokens": 20,
				"total_tokens":      30,
				"completion_tokens_details": map[string]any{
					"reasoning_tokens": 7,
				},
			},
		})
	}))
	defer server.Close()

	h := newHarness()
	profile := modelProfile{Name: "mock-brain", URL: server.URL, APIKey: "mock-key"}
	content, details, err := h.callJSONModelContextWithDetails(
		context.Background(),
		"session-1",
		profile,
		"brain",
		"request-1",
		"system prompt",
		map[string]any{"text": "你好"},
		nil,
	)
	if err != nil {
		t.Fatalf("callJSONModelContextWithDetails failed: %v", err)
	}
	if content == "" || details.ResponseID != "response-1" || details.ReasoningContent != "先判断问题，再组织回答。" || details.ReasoningTokens != 7 {
		t.Fatalf("unexpected model response details: content=%q details=%+v", content, details)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("failed to read structured log: %v", err)
	}
	var sawResponse, sawOutput, sawReasoning bool
	for _, rawLine := range splitLogLines(data) {
		var entry map[string]any
		if err := json.Unmarshal(rawLine, &entry); err != nil {
			t.Fatalf("failed to decode log line: %v", err)
		}
		payload, _ := entry["payload"].(map[string]any)
		switch entry["kind"] {
		case "harness.brain.model.response.received":
			sawResponse = payload["reasoningPresent"] == true && payload["reasoningContentBytes"] != nil
		case "harness.brain.model.output":
			sawOutput = payload["content"] == content
		case "harness.brain.model.reasoning":
			sawReasoning = payload["reasoningContent"] == "先判断问题，再组织回答。" && payload["reasoningTokens"] == float64(7)
		}
	}
	if !sawResponse || !sawOutput || !sawReasoning {
		t.Fatalf("expected response, output, and reasoning diagnostics in log: response=%v output=%v reasoning=%v", sawResponse, sawOutput, sawReasoning)
	}
}

func TestKnowledgeContextRoundTripIsRoutedByEventID(t *testing.T) {
	h := newHarness()
	h.cfg.KnowledgeMode = "rag"
	h.prepareKnowledgeRequest("event-knowledge")
	go func() {
		time.Sleep(10 * time.Millisecond)
		h.receiveKnowledgeContext("event-knowledge", []map[string]any{{"content": "matching passage", "score": 0.9}}, "ready", "")
	}()
	result := h.awaitKnowledgeContext(context.Background(), "event-knowledge")
	if result.status != "ready" || len(result.matches) != 1 || result.matches[0]["content"] != "matching passage" {
		t.Fatalf("unexpected knowledge context: %+v", result)
	}
}

func TestKnowledgeContextReceivedBeforeAwaitIsRetained(t *testing.T) {
	h := newHarness()
	h.cfg.KnowledgeMode = "rag"
	h.prepareKnowledgeRequest("event-already-received")
	h.receiveKnowledgeContext("event-already-received", []map[string]any{{"content": "retained passage"}}, "ready", "")
	h.knowledgeMu.Lock()
	_, retained := h.knowledgeWaiters["event-already-received"]
	h.knowledgeMu.Unlock()
	if !retained {
		t.Fatal("knowledge result must remain available until await consumes it")
	}

	result := h.awaitKnowledgeContext(context.Background(), "event-already-received")
	if result.status != "ready" || len(result.matches) != 1 || result.matches[0]["content"] != "retained passage" {
		t.Fatalf("unexpected retained knowledge context: %+v", result)
	}
	h.knowledgeMu.Lock()
	defer h.knowledgeMu.Unlock()
	if _, exists := h.knowledgeWaiters["event-already-received"]; exists {
		t.Fatal("knowledge waiter should be removed only after await consumes the result")
	}
}

func TestKnowledgeContextReadsElectronErrorField(t *testing.T) {
	h := newHarness()
	h.cfg.KnowledgeMode = "rag"
	h.prepareKnowledgeRequest("event-error")
	var command inputCommand
	if err := json.Unmarshal([]byte(`{"type":"knowledge.context","eventId":"event-error","status":"error","error":"embedding service unavailable"}`), &command); err != nil {
		t.Fatalf("failed to decode Electron knowledge context: %v", err)
	}
	h.handleCommand(command)

	result := h.awaitKnowledgeContext(context.Background(), "event-error")
	if result.status != "error" || result.err != "embedding service unavailable" {
		t.Fatalf("expected Electron error field to reach the knowledge result, got %+v", result)
	}
}

func TestKnowledgeContextIsDisabledWithoutRAGMode(t *testing.T) {
	h := newHarness()
	result := h.awaitKnowledgeContext(context.Background(), "event-disabled")
	if result.status != "disabled" || len(result.matches) != 0 {
		t.Fatalf("expected disabled knowledge context, got %+v", result)
	}
}

func TestPromptKnowledgeIncludesHydratedFilesButRAGDoesNotInjectRawText(t *testing.T) {
	prompt := buildRoleSystemPrompt(map[string]any{
		"knowledgeMode":  "prompt",
		"knowledgeText":  "pasted reference",
		"knowledgeFiles": []any{map[string]any{"name": "notes.md", "content": "file reference"}},
	})
	if !strings.Contains(prompt, "pasted reference") || !strings.Contains(prompt, "file reference") {
		t.Fatalf("prompt mode should include raw knowledge: %s", prompt)
	}
	ragPrompt := buildRoleSystemPrompt(map[string]any{
		"knowledgeMode":  "rag",
		"knowledgeText":  "do not inject this",
		"knowledgeFiles": []any{map[string]any{"name": "notes.md", "content": "do not inject this either"}},
	})
	if strings.Contains(ragPrompt, "do not inject this") || strings.Contains(ragPrompt, "do not inject this either") {
		t.Fatalf("RAG mode should not inject raw knowledge: %s", ragPrompt)
	}
	nonePrompt := buildRoleSystemPrompt(map[string]any{
		"knowledgeMode":  "none",
		"knowledgeText":  "do not inject this in none mode",
		"knowledgeFiles": []any{map[string]any{"name": "notes.md", "content": "do not inject this file in none mode"}},
	})
	if strings.Contains(nonePrompt, "do not inject this in none mode") || strings.Contains(nonePrompt, "do not inject this file in none mode") {
		t.Fatalf("none mode should not inject raw knowledge: %s", nonePrompt)
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

func TestStoppingTurnClosesBlockedTTSRead(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		for {
			if _, _, err := connection.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	profile := modelProfile{
		Name:   "blocked-tts",
		URL:    strings.Replace(server.URL, "http://", "ws://", 1),
		APIKey: "mock-key",
	}
	h := newHarness()
	h.ctx = context.Background()
	h.cfg.SessionID = "session-blocked-tts"
	h.cfg.SpeakingEnabled = true
	h.cfg.Models = map[string]modelProfile{"speak": profile}
	h.sessionGeneration = 1
	turn := turnRequest{
		ctx:             h.ctx,
		sessionID:       h.cfg.SessionID,
		generation:      h.sessionGeneration,
		speakingEnabled: true,
		speakProfile:    profile,
	}
	done := make(chan bool, 1)
	go func() {
		done <- h.executeTurnAction(turn, brainAction{Type: "speak", Text: "等待 TTS"})
	}()

	deadline := time.Now().Add(time.Second)
	for {
		h.ttsMu.Lock()
		blocked := len(h.ttsSockets) > 0
		h.ttsMu.Unlock()
		if blocked {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("TTS socket was not registered")
		}
		time.Sleep(time.Millisecond)
	}
	h.stopInternal(false)

	select {
	case executed := <-done:
		if executed {
			t.Fatal("stopped turn must not report TTS completion")
		}
	case <-time.After(time.Second):
		t.Fatal("stop did not interrupt the blocked TTS read")
	}
	h.ttsMu.Lock()
	remaining := len(h.ttsSockets)
	h.ttsMu.Unlock()
	if remaining != 0 {
		t.Fatalf("stopped TTS socket must be unregistered, got %d", remaining)
	}
}

func TestStoppingTurnCancelsTTSDial(t *testing.T) {
	dialStarted := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		select {
		case dialStarted <- struct{}{}:
		default:
		}
		<-request.Context().Done()
	}))
	defer server.Close()

	profile := modelProfile{
		Name:   "blocked-tts-dial",
		URL:    strings.Replace(server.URL, "http://", "ws://", 1),
		APIKey: "mock-key",
	}
	sessionCtx, sessionCancel := context.WithCancel(context.Background())
	h := newHarness()
	h.ctx = sessionCtx
	h.cancel = sessionCancel
	h.cfg.SessionID = "session-blocked-tts-dial"
	h.cfg.SpeakingEnabled = true
	h.cfg.Models = map[string]modelProfile{"speak": profile}
	h.sessionGeneration = 1
	turn := turnRequest{
		ctx:             sessionCtx,
		sessionID:       h.cfg.SessionID,
		generation:      h.sessionGeneration,
		speakingEnabled: true,
		speakProfile:    profile,
	}
	done := make(chan bool, 1)
	go func() {
		done <- h.executeTurnAction(turn, brainAction{Type: "speak", Text: "等待握手"})
	}()
	select {
	case <-dialStarted:
	case <-time.After(time.Second):
		t.Fatal("TTS dial did not reach the stalled handshake")
	}

	h.stopInternal(false)
	select {
	case executed := <-done:
		if executed {
			t.Fatal("stopped turn must not report TTS dial completion")
		}
	case <-time.After(time.Second):
		t.Fatal("stop did not cancel the blocked TTS dial")
	}
}

func TestASRReconnectUsesCancellableContext(t *testing.T) {
	dialStarted := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		select {
		case dialStarted <- struct{}{}:
		default:
		}
		<-request.Context().Done()
	}))
	defer server.Close()

	profile := modelProfile{
		Name:   "blocked-asr-dial",
		URL:    strings.Replace(server.URL, "http://", "ws://", 1),
		APIKey: "mock-key",
	}
	dialContext, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := newHarness()
	done := make(chan struct{})
	go func() {
		h.reconnectASR(dialContext, profile, "zh-CN", 2, "session-asr-reconnect")
		close(done)
	}()
	select {
	case <-dialStarted:
	case <-time.After(time.Second):
		t.Fatal("ASR reconnect did not reach the stalled handshake")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("ASR reconnect did not stop after context cancellation")
	}
}

func TestASRCloseSessionDoesNotWaitForWriter(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		for {
			if _, _, err := connection.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	socket, err := dialRealtime(modelProfile{
		Name:   "asr-close-order",
		URL:    strings.Replace(server.URL, "http://", "ws://", 1),
		APIKey: "mock-key",
	}, defaultListenURL)
	if err != nil {
		t.Fatalf("failed to establish ASR test socket: %v", err)
	}
	defer socket.close()

	client := &asrClient{socket: socket}
	// Model an in-flight WriteJSON that is holding the socket writer. Closing
	// the transport must still complete immediately instead of waiting for it.
	socket.write.Lock()
	done := make(chan struct{})
	go func() {
		client.closeSession()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		socket.write.Unlock()
		t.Fatal("ASR closeSession waited for an in-flight writer")
	}
	socket.write.Unlock()
}

func TestValidateStartConfigRejectsIncompleteAndInvalidModelProfiles(t *testing.T) {
	base := startConfig{
		Models: map[string]modelProfile{
			"brain":  {Name: "brain", URL: "http://127.0.0.1:1/v1", APIKey: "key"},
			"listen": {Name: "listen", URL: "ws://127.0.0.1:1", APIKey: "key"},
			"speak":  {Name: "speak", URL: "ws://127.0.0.1:1", APIKey: "key"},
			"see":    {Name: "see", URL: "http://127.0.0.1:1/v1", APIKey: "key"},
		},
	}
	if err := validateStartConfig(base); err != nil {
		t.Fatalf("valid model profiles should pass validation: %v", err)
	}

	missing := base
	missing.Models = map[string]modelProfile{}
	if err := validateStartConfig(missing); err == nil || !strings.Contains(err.Error(), "brain") {
		t.Fatalf("expected missing Brain validation error, got %v", err)
	}

	invalidURL := base
	invalidURL.Models = make(map[string]modelProfile, len(base.Models))
	for module, profile := range base.Models {
		invalidURL.Models[module] = profile
	}
	invalidURL.Models["brain"] = modelProfile{Name: "brain", URL: "ws://127.0.0.1:1", APIKey: "key"}
	if err := validateStartConfig(invalidURL); err == nil || !strings.Contains(err.Error(), "Brain") {
		t.Fatalf("expected Brain URL validation error, got %v", err)
	}
}

func TestStartClampsHarnessSettingsBeforeRuntimeStarts(t *testing.T) {
	h := newHarness()
	config := startConfig{
		SessionID: "session-clamp",
		Models: map[string]modelProfile{
			"brain":  {Name: "brain", URL: "http://127.0.0.1:1/v1", APIKey: "key"},
			"listen": {Name: "listen", URL: "ws://127.0.0.1:1", APIKey: "key"},
			"speak":  {Name: "speak", URL: "ws://127.0.0.1:1", APIKey: "key"},
			"see":    {Name: "see", URL: "http://127.0.0.1:1/v1", APIKey: "key"},
		},
		SeeMinIntervalMS:        999999,
		SeeChangeThreshold:      999,
		RecentConversationCount: 0,
		RecentVisionCount:       999,
		ScreenVisionEnabled:     false,
		ListeningEnabled:        false,
		SpeakingEnabled:         false,
	}
	if err := h.start(config); err != nil {
		t.Fatalf("Harness should start with disabled realtime capabilities: %v", err)
	}
	defer h.stop()
	if h.cfg.SeeMinIntervalMS != 60000 || h.cfg.SeeChangeThreshold != 100 || h.cfg.RecentConversationCount != defaultRecentMessages || h.cfg.RecentVisionCount != maxVisionHistory {
		t.Fatalf("start did not clamp settings as expected: %+v", h.cfg)
	}
	if h.asr != nil {
		t.Fatal("disabled Listening must not create an ASR client")
	}
}

func TestRealtimeAndChatURLsNormalizeKnownProviderShapes(t *testing.T) {
	realtime, err := realtimeURL("ws://localhost:9000/realtime", "qwen-asr", "ws://fallback")
	if err != nil || !strings.Contains(realtime, "model=qwen-asr") {
		t.Fatalf("expected model query to be added, got %q, %v", realtime, err)
	}
	if _, err := realtimeURL("https://localhost:9000", "model", "ws://fallback"); err == nil {
		t.Fatal("https URL must not be accepted as a Realtime endpoint")
	}
	if got, err := chatCompletionsURL("https://example.com/compatible-mode", "https://fallback/v1"); err != nil || got != "https://example.com/compatible-mode/v1/chat/completions" {
		t.Fatalf("unexpected compatible-mode endpoint: %q, %v", got, err)
	}
	if _, err := chatCompletionsURL("ws://example.com/v1", "https://fallback/v1"); err == nil {
		t.Fatal("WebSocket URL must not be accepted as a chat completion endpoint")
	}
}

func TestASREventHandlingTracksSpeechAndIgnoresEmptyTranscript(t *testing.T) {
	h := newHarness()
	h.handleASREvent(map[string]any{"type": "input_audio_buffer.speech_started", "event_id": "speech-1"})
	h.stateMu.Lock()
	started := h.speechStartedAt
	h.stateMu.Unlock()
	if started.IsZero() {
		t.Fatal("speech_started should record the speech start time")
	}
	h.handleASREvent(map[string]any{"type": "conversation.item.input_audio_transcription.completed", "item_id": "empty", "transcript": "   "})
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	if h.speechStartedAt.IsZero() {
		t.Fatal("an empty transcript should not consume the pending speech start timestamp")
	}
}

func TestLatestVisionSnapshotReportsWaitingWhenSharedButNeverAnalyzed(t *testing.T) {
	h := newHarness()
	h.cfg.ScreenVisionEnabled = true
	h.screenSharing = true
	vision, eventID, status, age := h.latestVisionSnapshot()
	if vision != nil || eventID != "" || status != "waiting" || age != -1 {
		t.Fatalf("unexpected waiting state: vision=%+v event=%q status=%q age=%d", vision, eventID, status, age)
	}
}

func TestRequestSeeJoinsExistingAnalysisAndFutureResolvesOnce(t *testing.T) {
	h := newHarness()
	future := newSeeFuture()
	future.requestID = "see-analysis-existing"
	future.requestedAt = time.Now()
	h.stateMu.Lock()
	h.seeAnalyzing = future
	h.stateMu.Unlock()
	if joined := h.requestSee("frame.changed"); joined != future {
		t.Fatal("a See request during model analysis must join the existing future")
	}

	first := &visionPayload{Scene: "first"}
	future.resolve(first, nil)
	future.resolve(nil, errors.New("late failure"))
	select {
	case <-future.done:
	case <-time.After(time.Second):
		t.Fatal("future did not resolve")
	}
	if future.result != first || future.err != nil {
		t.Fatalf("future should preserve its first resolution: result=%+v err=%v", future.result, future.err)
	}
}

func TestClearConversationContextResetsSummaryAndHistory(t *testing.T) {
	h := newHarness()
	h.cfg.SessionID = "session-clear"
	h.history = []conversationMessage{{Role: "user", Text: "old"}}
	h.historyRevision = 1
	h.conversationSummary = conversationSummary{Topic: "old topic", Facts: []string{"old fact"}}
	h.summaryCoveredRevision = 1
	h.summaryInFlight = true
	oldGeneration := h.summaryGeneration
	h.clearConversationContext()
	if len(h.history) != 0 || h.historyRevision != 0 || h.summaryCoveredRevision != 0 || h.summaryInFlight {
		t.Fatalf("conversation context was not fully reset: %+v", h)
	}
	if h.conversationSummary.Topic != "" || len(h.conversationSummary.Facts) != 0 || h.summaryGeneration <= oldGeneration {
		t.Fatalf("summary was not reset or generation was not invalidated: %+v", h)
	}
}

func TestConversationSummaryRejectsStaleResultAndInstallsCurrentResult(t *testing.T) {
	h := newHarness()
	h.cfg.SessionID = "session-summary"
	h.conversationSummary = conversationSummary{Topic: "original"}
	h.summaryInFlight = true
	h.summaryInFlightGeneration = 2
	h.summaryGeneration = 2
	h.finishConversationSummary("session-summary", 1, 1, 1, "stale", conversationSummary{Topic: "stale"}, nil, time.Now())
	if h.conversationSummary.Topic != "original" || !h.summaryInFlight {
		t.Fatalf("stale summary result must be discarded: %+v", h)
	}

	h.finishConversationSummary("session-summary", 2, 1, 2, "current", conversationSummary{Topic: "current"}, nil, time.Now())
	if h.conversationSummary.Topic != "current" || h.summaryInFlight || h.summaryCoveredRevision != 2 {
		t.Fatalf("current summary result was not installed: %+v", h)
	}
}

func TestExecuteActionRejectsEmptySpeakUnsupportedAndDisabledDraw(t *testing.T) {
	h := newHarness()
	h.cfg.SessionID = "session-actions"
	h.cfg.SpeakingEnabled = false
	h.cfg.DrawingEnabled = false
	h.executeAction(brainAction{ActionID: "empty-speak", Type: "speak", Text: "  "})
	h.executeAction(brainAction{ActionID: "unsupported", Type: "erase"})
	h.executeAction(brainAction{ActionID: "disabled-draw", Type: "draw", Operation: "circle"})
	if len(historySnapshot(h)) != 0 {
		t.Fatalf("invalid or disabled actions must not append assistant history: %+v", historySnapshot(h))
	}
	h.actionMu.Lock()
	defer h.actionMu.Unlock()
	if len(h.pendingActions) != 0 {
		t.Fatalf("invalid or disabled actions must not leave pending draw actions: %+v", h.pendingActions)
	}
}

func TestAnalyzeSeeFailureDoesNotReplaceSuccessfulBaseline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "mock See unavailable", http.StatusBadGateway)
	}))
	defer server.Close()

	h := newHarness()
	h.cfg = startConfig{
		SessionID: "session-see-failure",
		Models: map[string]modelProfile{
			"see": {Name: "mock-see", URL: server.URL + "/v1", APIKey: "mock-key"},
		},
	}
	h.latestSeeFrame = "successful-baseline"
	h.latestSeeEvent = "see-success"
	future := newSeeFuture()
	future.requestID = "see-failure"
	future.reason = "unit_test"
	h.seeAnalyzing = future
	h.analyzeSee(future, "current-frame")

	select {
	case <-future.done:
	case <-time.After(time.Second):
		t.Fatal("See future did not resolve after model failure")
	}
	if future.err == nil {
		t.Fatal("expected a model error from the mock See server")
	}
	if h.latestSeeFrame != "successful-baseline" || h.latestSeeEvent != "see-success" {
		t.Fatalf("failed See must preserve the last successful baseline: frame=%q event=%q", h.latestSeeFrame, h.latestSeeEvent)
	}
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	if h.seeAnalyzing != nil {
		t.Fatal("failed See analysis must leave the in-flight state clear")
	}
}

func TestBrainFailureDoesNotCreateAssistantHistoryOrActions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "mock Brain unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	h := newHarness()
	h.ctx = context.Background()
	h.cfg = startConfig{
		SessionID: "session-brain-failure",
		Models: map[string]modelProfile{
			"brain": {Name: "mock-brain", URL: server.URL + "/v1", APIKey: "mock-key"},
		},
	}
	h.handleCompletedListen(signal{EventID: "listen-1", SessionID: h.cfg.SessionID}, listenPayload{Text: "hello"}, "")
	if len(historySnapshot(h)) != 0 {
		t.Fatalf("Brain failure must not create assistant history: %+v", historySnapshot(h))
	}
	h.actionMu.Lock()
	defer h.actionMu.Unlock()
	if len(h.pendingActions) != 0 {
		t.Fatalf("Brain failure must not leave pending actions: %+v", h.pendingActions)
	}
}

func TestBrainInvalidActionDoesNotExecuteDraw(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"choices":[{"message":{"content":"{\\"actions\\":[{\\"type\\":\\"draw\\",\\"operation\\":\\"circle\\"}]}"}}]}`))
	}))
	defer server.Close()

	h := newHarness()
	h.ctx = context.Background()
	h.cfg = startConfig{
		SessionID: "session-invalid-action",
		Models: map[string]modelProfile{
			"brain": {Name: "mock-brain", URL: server.URL + "/v1", APIKey: "mock-key"},
		},
	}
	h.handleCompletedListen(signal{EventID: "listen-1", SessionID: h.cfg.SessionID}, listenPayload{Text: "draw it"}, "")
	if len(historySnapshot(h)) != 0 {
		t.Fatalf("invalid Brain action must not create history: %+v", historySnapshot(h))
	}
	h.actionMu.Lock()
	defer h.actionMu.Unlock()
	if len(h.pendingActions) != 0 {
		t.Fatalf("invalid Brain action must not execute Draw: %+v", h.pendingActions)
	}
}
