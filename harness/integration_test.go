//go:build integration

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type mockChatCall struct {
	Model        string
	Body         map[string]any
	UserContent  any
	HasMaxTokens bool
}

type mockChatServer struct {
	server       *httptest.Server
	seeCalls     chan mockChatCall
	brainCalls   chan mockChatCall
	summaryCalls chan mockChatCall
	includeDraw  bool
}

func newMockChatServer(t *testing.T, includeDraw bool) *mockChatServer {
	t.Helper()
	mock := &mockChatServer{
		seeCalls:     make(chan mockChatCall, 4),
		brainCalls:   make(chan mockChatCall, 4),
		summaryCalls: make(chan mockChatCall, 4),
		includeDraw:  includeDraw,
	}
	mock.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/chat/completions" {
			http.NotFound(writer, request)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		model, _ := body["model"].(string)
		messages, _ := body["messages"].([]any)
		var userContent any
		if len(messages) > 1 {
			if userMessage, ok := messages[1].(map[string]any); ok {
				userContent = userMessage["content"]
				if encoded, isString := userContent.(string); isString {
					var decoded map[string]any
					if json.Unmarshal([]byte(encoded), &decoded) == nil {
						userContent = decoded
					}
				}
			}
		}
		call := mockChatCall{
			Model:        model,
			Body:         body,
			UserContent:  userContent,
			HasMaxTokens: body["max_tokens"] != nil,
		}
		var content string
		if model == "mock-see" {
			content = `{"scene":"一个桌面应用窗口","vision_summary":"右上角有一个按钮","objects":[{"objectId":"obj_button","label":"按钮","bbox_2d":[100,200,400,500],"confidence":0.95}],"textBlocks":[]}`
			mock.seeCalls <- call
		} else if len(messages) > 0 {
			if systemMessage, ok := messages[0].(map[string]any); ok && strings.Contains(stringValueForTest(systemMessage["content"]), "摘要器") {
				content = `{"topic":"mock conversation","facts":["用户完成了 Harness 测试"],"decisions":[],"pendingTasks":[],"lastIntent":"继续验证"}`
				mock.summaryCalls <- call
			} else {
				content = `{"actions":[{"actionId":"speak_mock","type":"speak","text":"我看到了这个按钮。"}]}`
				if mock.includeDraw {
					content = `{"actions":[{"actionId":"speak_mock","type":"speak","text":"好的，我来标记这个按钮。"},{"actionId":"draw_mock","type":"draw","operation":"circle","target":{"bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.3}}}]}`
				}
				mock.brainCalls <- call
			}
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"id":    "mock-response",
			"model": model,
			"choices": []any{map[string]any{
				"index":         0,
				"finish_reason": "stop",
				"message":       map[string]any{"content": content},
			}},
			"usage": map[string]any{"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
		})
	}))
	return mock
}

func stringValueForTest(value any) string {
	text, _ := value.(string)
	return text
}

func (mock *mockChatServer) close() {
	mock.server.Close()
}

type mockRealtimeServer struct {
	server     *httptest.Server
	ttsCommits chan struct{}
}

func newMockRealtimeServer(t *testing.T) *mockRealtimeServer {
	t.Helper()
	mock := &mockRealtimeServer{ttsCommits: make(chan struct{}, 4)}
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}
	mock.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		go func() {
			defer connection.Close()
			isASR := false
			for {
				_, data, readErr := connection.ReadMessage()
				if readErr != nil {
					return
				}
				var event map[string]any
				if json.Unmarshal(data, &event) != nil {
					continue
				}
				eventType, _ := event["type"].(string)
				switch eventType {
				case "session.update":
					session, _ := event["session"].(map[string]any)
					_, isASR = session["modalities"]
					_ = connection.WriteJSON(map[string]any{"type": "session.updated"})
				case "input_audio_buffer.append":
					if isASR {
						_ = connection.WriteJSON(map[string]any{
							"type":       "conversation.item.input_audio_transcription.completed",
							"item_id":    "mock-utterance",
							"transcript": "请圈出这个按钮",
						})
					}
				case "input_text_buffer.commit":
					if !isASR {
						mock.ttsCommits <- struct{}{}
						_ = connection.WriteJSON(map[string]any{"type": "response.audio.delta", "delta": "AQID"})
						_ = connection.WriteJSON(map[string]any{"type": "response.audio.done"})
						_ = connection.WriteJSON(map[string]any{"type": "response.done", "usage": map[string]any{
							"input_tokens": 4, "output_tokens": 3, "total_tokens": 7,
						}})
					}
				case "session.finish":
					_ = connection.WriteJSON(map[string]any{"type": "session.finished"})
					return
				}
			}
		}()
	}))
	return mock
}

func (mock *mockRealtimeServer) close() {
	mock.server.Close()
}

func mockWebSocketURL(server *httptest.Server) string {
	return strings.Replace(server.URL, "http://", "ws://", 1)
}

func mockStartConfig(chatURL, realtimeURL string, initiative, drawing, vision bool) startConfig {
	return startConfig{
		SessionID: "mock-session",
		Models: map[string]modelProfile{
			"brain":  {Name: "mock-brain", URL: chatURL, APIKey: "mock-key"},
			"listen": {Name: "mock-listen", URL: realtimeURL, APIKey: "mock-key"},
			"speak":  {Name: "mock-speak", URL: realtimeURL, APIKey: "mock-key"},
			"see":    {Name: "mock-see", URL: chatURL, APIKey: "mock-key"},
		},
		Role: map[string]any{
			"name":              "Mock role",
			"listeningLanguage": "zh-CN",
			"outputLanguage":    "zh-CN",
		},
		SeeMinIntervalMS:        1000,
		SeeChangeThreshold:      8,
		ScreenVisionEnabled:     vision,
		ScreenSharing:           vision,
		RecentConversationCount: 5,
		RecentVisionCount:       1,
		InitiativeEnabled:       initiative,
		ListeningEnabled:        true,
		SpeakingEnabled:         true,
		DrawingEnabled:          drawing,
	}
}

func TestHarnessMockSessionFlow(t *testing.T) {
	chat := newMockChatServer(t, true)
	defer chat.close()
	realtime := newMockRealtimeServer(t)
	defer realtime.close()

	h := newHarness()
	if err := h.start(mockStartConfig(chat.server.URL, mockWebSocketURL(realtime.server), false, true, true)); err != nil {
		t.Fatalf("Harness failed to start with mocks: %v", err)
	}
	defer h.stop()

	seeFuture := h.requestSee("integration_test")
	h.receiveFrame("mock-frame", "see", seeFuture.requestID)
	select {
	case <-seeFuture.done:
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for mocked See")
	}
	if seeFuture.err != nil {
		t.Fatalf("mocked See failed: %v", seeFuture.err)
	}
	select {
	case call := <-chat.seeCalls:
		if call.HasMaxTokens {
			t.Fatal("See request must omit max_tokens")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("mock See did not receive a request")
	}

	h.handleCommand(inputCommand{Type: "audio", Data: "AQID"})
	var brainCall mockChatCall
	select {
	case brainCall = <-chat.brainCalls:
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for mocked Brain")
	}
	userInput, ok := brainCall.UserContent.(map[string]any)
	if !ok {
		t.Fatalf("expected Brain user content object, got %T", brainCall.UserContent)
	}
	if userInput["trigger"] != "listen" || userInput["currentUserText"] != "请圈出这个按钮" {
		t.Fatalf("unexpected Brain trigger input: %+v", userInput)
	}
	if userInput["latestVision"] == nil {
		t.Fatal("Brain request did not include the successful See context")
	}

	select {
	case <-realtime.ttsCommits:
	case <-time.After(4 * time.Second):
		t.Fatal("mock TTS did not receive the speak action")
	}
	var drawActionID string
	waitForCondition(t, "draw action to become pending", func() bool {
		h.actionMu.Lock()
		defer h.actionMu.Unlock()
		for actionID := range h.pendingActions {
			drawActionID = actionID
			return true
		}
		return false
	})
	h.receiveActionResult(drawActionID, actionResult{OK: true, Result: json.RawMessage(`{"ok":true}`)})
	waitForCondition(t, "assistant history after the complete session", func() bool {
		for _, message := range historySnapshot(h) {
			if message.Role == "assistant" && message.Text != "" {
				return true
			}
		}
		return false
	})
	if len(historySnapshot(h)) < 2 {
		t.Fatalf("expected user and assistant history, got %+v", historySnapshot(h))
	}
}

func TestHarnessMockInitiativeFlowDoesNotCreateUserMessage(t *testing.T) {
	chat := newMockChatServer(t, false)
	defer chat.close()
	realtime := newMockRealtimeServer(t)
	defer realtime.close()

	h := newHarness()
	if err := h.start(mockStartConfig(chat.server.URL, mockWebSocketURL(realtime.server), true, false, false)); err != nil {
		t.Fatalf("Harness failed to start with mocks: %v", err)
	}
	defer h.stop()

	h.handleCommand(inputCommand{Type: "initiative", Data: "请在安静时自然推进一次对话"})
	var brainCall mockChatCall
	select {
	case brainCall = <-chat.brainCalls:
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for Brain initiative request")
	}
	userInput, ok := brainCall.UserContent.(map[string]any)
	if !ok {
		t.Fatalf("expected Brain user content object, got %T", brainCall.UserContent)
	}
	if userInput["trigger"] != "initiative" {
		t.Fatalf("expected initiative trigger, got %+v", userInput["trigger"])
	}
	if userInput["currentUserText"] != "" || userInput["initiativePrompt"] != "请在安静时自然推进一次对话" {
		t.Fatalf("initiative prompt was not separated from user text: %+v", userInput)
	}
	if len(historySnapshot(h)) != 0 {
		t.Fatalf("initiative must not create a user history entry: %+v", historySnapshot(h))
	}
	select {
	case <-realtime.ttsCommits:
	case <-time.After(4 * time.Second):
		t.Fatal("mock TTS did not receive the proactive speak action")
	}
	waitForCondition(t, "proactive assistant history", func() bool {
		items := historySnapshot(h)
		return len(items) == 1 && items[0].Role == "assistant"
	})
}

func TestHarnessMockConversationSummaryRunsSeparatelyAndInstallsResult(t *testing.T) {
	chat := newMockChatServer(t, false)
	defer chat.close()

	h := newHarness()
	config := mockStartConfig(chat.server.URL, "ws://127.0.0.1:1", false, false, false)
	config.ListeningEnabled = false
	config.SpeakingEnabled = false
	if err := h.start(config); err != nil {
		t.Fatalf("Harness failed to start for summary test: %v", err)
	}
	defer h.stop()

	for index := 0; index < conversationSummaryTriggerMessages; index++ {
		h.appendHistory("user", "message "+string(rune('A'+index)))
	}
	h.maybeStartConversationSummary()
	select {
	case call := <-chat.summaryCalls:
		if !call.HasMaxTokens {
			t.Fatal("conversation summary request should use its bounded max_tokens")
		}
		if got, ok := call.Body["max_tokens"].(float64); !ok || int(got) != conversationSummaryMaxTokens {
			t.Fatalf("unexpected summary max_tokens: %#v", call.Body["max_tokens"])
		}
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for independent summary request")
	}
	waitForCondition(t, "conversation summary installation", func() bool {
		return h.currentConversationSummary().Topic == "mock conversation"
	})
	h.mu.Lock()
	summaryInFlight := h.summaryInFlight
	h.mu.Unlock()
	if summaryInFlight {
		t.Fatal("summary request should not remain in flight after completion")
	}
}
