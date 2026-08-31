package main

import (
	"strings"
	"testing"
)

func TestKnowledgeModesNormalizeWithBackwardCompatibleDefaults(t *testing.T) {
	for _, testCase := range []struct {
		input string
		want  string
	}{
		{"none", knowledgeModeNone},
		{"prompt", knowledgeModePrompt},
		{"rag", knowledgeModeRAG},
		{"unknown", knowledgeModePrompt},
		{"", knowledgeModePrompt},
	} {
		if got := normalizeKnowledgeMode(testCase.input); got != testCase.want {
			t.Fatalf("normalizeKnowledgeMode(%q) = %q, want %q", testCase.input, got, testCase.want)
		}
	}
	if got := normalizeKnowledgeRetrievalMode("deep"); got != knowledgeRetrievalModeDeep {
		t.Fatalf("deep retrieval mode normalized to %q", got)
	}
	if got := normalizeKnowledgeRetrievalMode("invalid"); got != knowledgeRetrievalModeFast {
		t.Fatalf("invalid retrieval mode normalized to %q", got)
	}
}

func TestFastKnowledgeQueryUsesBoundedConversationContext(t *testing.T) {
	turn := turnRequest{
		payload:             listenPayload{Text: "它为什么失败？"},
		conversationSummary: conversationSummary{Topic: "OAuth 登录", Facts: []string{"使用 callback URL"}},
		recentTurns: []conversationMessage{
			{Role: "user", Text: "最早的无关内容"},
			{Role: "assistant", Text: "助手回答 1"},
			{Role: "user", Text: "用户问题 2"},
			{Role: "assistant", Text: "助手回答 2"},
			{Role: "user", Text: "用户问题 3"},
			{Role: "assistant", Text: "助手回答 3"},
			{Role: "user", Text: "用户问题 4"},
		},
	}
	query := buildFastKnowledgeQuery(turn)
	for _, required := range []string{"当前输入", "它为什么失败？", "OAuth 登录", "最近对话", "用户问题 4"} {
		if !strings.Contains(query, required) {
			t.Fatalf("fast query is missing %q: %s", required, query)
		}
	}
	if strings.Contains(query, "最早的无关内容") {
		t.Fatalf("fast query should keep only the bounded recent window: %s", query)
	}
}

func TestParseDeepKnowledgeSearchDecision(t *testing.T) {
	decision, err := parseDeepKnowledgeDecision(`{"type":"knowledge.search","query":"OAuth callback URL validation","intent":"verify","focus":["错误原因","适用条件"]}`, "session-1", "listen-1", "see-1")
	if err != nil {
		t.Fatalf("parse deep knowledge search decision failed: %v", err)
	}
	if decision.Plan == nil || decision.Plan.Query != "OAuth callback URL validation" || decision.Plan.Intent != "verify" {
		t.Fatalf("unexpected knowledge plan: %+v", decision.Plan)
	}
	if len(decision.Plan.Focus) != 2 || decision.DirectAction != nil {
		t.Fatalf("unexpected deep search decision: %+v", decision)
	}
}

func TestParseDeepKnowledgeDirectActionDecision(t *testing.T) {
	decision, err := parseDeepKnowledgeDecision(`{"type":"brain.action","actions":[{"type":"speak","text":"这个问题不需要查询知识库"}]}`, "session-1", "listen-1", "see-1")
	if err != nil {
		t.Fatalf("parse direct deep decision failed: %v", err)
	}
	if decision.Plan != nil || decision.DirectAction == nil || len(decision.DirectAction.Actions) != 1 {
		t.Fatalf("unexpected direct decision: %+v", decision)
	}
	if decision.DirectAction.Actions[0].Type != "speak" {
		t.Fatalf("unexpected direct action: %+v", decision.DirectAction.Actions)
	}
}

func TestNoneKnowledgeModeDoesNotEnterRolePrompt(t *testing.T) {
	prompt := buildRoleSystemPrompt(map[string]any{
		"knowledgeMode": "none",
		"knowledgeText": "must not be injected",
		"knowledgeFiles": []any{
			map[string]any{"name": "notes.md", "content": "must not be injected either"},
		},
	})
	if strings.Contains(prompt, "must not be injected") || strings.Contains(prompt, "must not be injected either") {
		t.Fatalf("none mode should not inject knowledge: %s", prompt)
	}
}
