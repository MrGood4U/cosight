//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type deepKnowledgeCall struct {
	Planner   bool
	UserInput map[string]any
}

type deepKnowledgeChatServer struct {
	server         *httptest.Server
	calls          chan deepKnowledgeCall
	releasePlanner chan struct{}
	releaseOnce    sync.Once
	plannerOutput  string
}

func newDeepKnowledgeChatServer(t *testing.T, plannerOutput string) *deepKnowledgeChatServer {
	t.Helper()
	mock := &deepKnowledgeChatServer{
		calls:          make(chan deepKnowledgeCall, 4),
		releasePlanner: make(chan struct{}),
		plannerOutput:  plannerOutput,
	}
	mock.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		messages, _ := body["messages"].([]any)
		systemPrompt := ""
		if len(messages) > 0 {
			if message, ok := messages[0].(map[string]any); ok {
				systemPrompt, _ = message["content"].(string)
			}
		}
		userInput := map[string]any{}
		if len(messages) > 1 {
			if message, ok := messages[1].(map[string]any); ok {
				if encoded, ok := message["content"].(string); ok {
					_ = json.Unmarshal([]byte(encoded), &userInput)
				}
			}
		}
		planner := strings.Contains(systemPrompt, "知识检索规划阶段")
		mock.calls <- deepKnowledgeCall{Planner: planner, UserInput: userInput}
		if planner {
			<-mock.releasePlanner
		}
		content := mock.plannerOutput
		if !planner {
			content = `{"actions":[{"actionId":"final-1","type":"speak","text":"最终回答使用了检索资料"}]}`
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"id":    "deep-knowledge-mock",
			"model": "deep-knowledge-mock",
			"choices": []any{map[string]any{
				"index":         0,
				"finish_reason": "stop",
				"message":       map[string]any{"content": content},
			}},
		})
	}))
	return mock
}

func (mock *deepKnowledgeChatServer) release() {
	mock.releaseOnce.Do(func() { close(mock.releasePlanner) })
}

func (mock *deepKnowledgeChatServer) close() {
	mock.server.Close()
}

func newDeepKnowledgeTestTurn(t *testing.T, mock *deepKnowledgeChatServer) (*harness, turnRequest, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	role := map[string]any{
		"id":                     "role-deep",
		"name":                   "Deep test role",
		"outputLanguage":         "zh-CN",
		"knowledgeMode":          "rag",
		"knowledgeRetrievalMode": "deep",
	}
	profile := modelProfile{Name: "deep-knowledge-mock", URL: mock.server.URL, APIKey: "mock-key"}
	h := newHarness()
	h.ctx = ctx
	h.cfg = startConfig{
		SessionID:              "deep-knowledge-session",
		Models:                 map[string]modelProfile{"brain": profile},
		Role:                   role,
		KnowledgeMode:          knowledgeModeRAG,
		KnowledgeRetrievalMode: knowledgeRetrievalModeDeep,
		SpeakingEnabled:        false,
	}
	h.sessionGeneration = 1
	turn := turnRequest{
		listen:                 signal{EventID: "listen-deep", SessionID: h.cfg.SessionID},
		payload:                listenPayload{Text: "这个 OAuth 问题怎么解决？"},
		queuedAt:               time.Now(),
		requestID:              "brain-deep-1",
		sessionID:              h.cfg.SessionID,
		generation:             h.sessionGeneration,
		ctx:                    ctx,
		brainProfile:           profile,
		role:                   role,
		roleID:                 "role-deep",
		knowledgeMode:          knowledgeModeRAG,
		knowledgeRetrievalMode: knowledgeRetrievalModeDeep,
		knowledgeRequestID:     "knowledge-deep-1",
	}
	return h, turn, cancel
}

func waitForKnowledgeWaiter(t *testing.T, h *harness, eventID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		h.knowledgeMu.Lock()
		_, exists := h.knowledgeWaiters[eventID]
		h.knowledgeMu.Unlock()
		if exists {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for knowledge waiter %q", eventID)
}

func waitForDeepTurn(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for Deep RAG turn")
	}
}

func TestDeepKnowledgeSearchRunsPlannerRetrievalAndFinalBrain(t *testing.T) {
	mock := newDeepKnowledgeChatServer(t, `{"type":"knowledge.search","query":"OAuth callback failure causes","intent":"verify","focus":["redirect URI","callback"]}`)
	defer mock.close()
	h, turn, cancel := newDeepKnowledgeTestTurn(t, mock)
	defer cancel()

	done := make(chan struct{})
	go func() {
		h.processTurn(turn)
		close(done)
	}()

	plannerCall := <-mock.calls
	if !plannerCall.Planner || plannerCall.UserInput["knowledgeStage"] != "planning" {
		t.Fatalf("expected a knowledge planner call, got %+v", plannerCall)
	}
	mock.release()
	waitForKnowledgeWaiter(t, h, turn.knowledgeRequestID)
	h.receiveKnowledgeContext(turn.knowledgeRequestID, []map[string]any{{
		"content": "OAuth callback 必须与注册的 redirect URI 完全一致。",
		"score":   0.95,
	}}, "ready", "")

	var finalCall deepKnowledgeCall
	select {
	case finalCall = <-mock.calls:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for final Brain call")
	}
	if finalCall.Planner {
		t.Fatalf("expected final Brain call after retrieval, got planner call: %+v", finalCall)
	}
	if finalCall.UserInput["knowledgeStatus"] != "ready" {
		t.Fatalf("final Brain did not receive ready knowledge status: %+v", finalCall.UserInput)
	}
	if _, ok := finalCall.UserInput["knowledgePlan"].(map[string]any); !ok {
		t.Fatalf("final Brain did not receive the planner result: %+v", finalCall.UserInput)
	}
	waitForDeepTurn(t, done)

	history := historySnapshot(h)
	if len(history) != 1 || history[0].Role != "assistant" || !strings.Contains(history[0].Text, "最终回答") {
		t.Fatalf("expected final Brain answer in history, got %+v", history)
	}
}

func TestDeepKnowledgePlannerCanReturnDirectBrainAction(t *testing.T) {
	mock := newDeepKnowledgeChatServer(t, `{"type":"brain.action","actions":[{"actionId":"direct-1","type":"speak","text":"无需检索，直接回答"}]}`)
	defer mock.close()
	h, turn, cancel := newDeepKnowledgeTestTurn(t, mock)
	defer cancel()

	done := make(chan struct{})
	go func() {
		h.processTurn(turn)
		close(done)
	}()
	plannerCall := <-mock.calls
	if !plannerCall.Planner {
		t.Fatalf("expected planner call, got %+v", plannerCall)
	}
	mock.release()
	waitForDeepTurn(t, done)

	select {
	case call := <-mock.calls:
		t.Fatalf("direct planner action must skip final Brain, got %+v", call)
	default:
	}
	history := historySnapshot(h)
	if len(history) != 1 || history[0].Text != "无需检索，直接回答" {
		t.Fatalf("expected direct planner action in history, got %+v", history)
	}
}

func TestDeepKnowledgeTimeoutStillReachesFinalBrainWithStatus(t *testing.T) {
	mock := newDeepKnowledgeChatServer(t, `{"type":"knowledge.search","query":"OAuth callback failure"}`)
	defer mock.close()
	h, turn, cancel := newDeepKnowledgeTestTurn(t, mock)
	defer cancel()

	done := make(chan struct{})
	go func() {
		h.processTurn(turn)
		close(done)
	}()
	plannerCall := <-mock.calls
	if !plannerCall.Planner {
		t.Fatalf("expected planner call, got %+v", plannerCall)
	}
	mock.release()
	waitForKnowledgeWaiter(t, h, turn.knowledgeRequestID)

	var finalCall deepKnowledgeCall
	select {
	case finalCall = <-mock.calls:
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for final Brain after knowledge timeout")
	}
	if finalCall.Planner || finalCall.UserInput["knowledgeStatus"] != "timeout" {
		t.Fatalf("expected timeout status in final Brain input, got %+v", finalCall)
	}
	waitForDeepTurn(t, done)
}

func TestDeepKnowledgeCancellationSkipsFinalBrain(t *testing.T) {
	mock := newDeepKnowledgeChatServer(t, `{"type":"knowledge.search","query":"OAuth callback failure"}`)
	defer mock.close()
	h, turn, cancel := newDeepKnowledgeTestTurn(t, mock)

	done := make(chan struct{})
	go func() {
		h.processTurn(turn)
		close(done)
	}()
	plannerCall := <-mock.calls
	if !plannerCall.Planner {
		t.Fatalf("expected planner call, got %+v", plannerCall)
	}
	mock.release()
	waitForKnowledgeWaiter(t, h, turn.knowledgeRequestID)
	cancel()
	waitForDeepTurn(t, done)

	select {
	case call := <-mock.calls:
		t.Fatalf("cancelled Deep RAG turn must not call final Brain, got %+v", call)
	default:
	}
}
