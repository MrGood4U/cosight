package main

import (
	"context"
	"strings"
	"time"
)

const knowledgeWaitTimeout = 2500 * time.Millisecond

type knowledgeResult struct {
	matches []map[string]any
	status  string
	err     string
}

func (h *harness) prepareKnowledgeRequest(eventID string) {
	if eventID == "" {
		return
	}
	h.knowledgeMu.Lock()
	if h.knowledgeWaiters == nil {
		h.knowledgeWaiters = make(map[string]chan knowledgeResult)
	}
	if _, exists := h.knowledgeWaiters[eventID]; !exists {
		h.knowledgeWaiters[eventID] = make(chan knowledgeResult, 1)
	}
	h.knowledgeMu.Unlock()
}

func (h *harness) requestKnowledge(eventID, query string) {
	h.mu.Lock()
	mode := h.cfg.KnowledgeMode
	roleID := stringValue(h.cfg.Role["id"], "")
	h.mu.Unlock()
	h.requestKnowledgeWithConfig(eventID, roleID, mode, query)
}

func (h *harness) requestKnowledgeWithConfig(eventID, roleID, mode, query string) {
	if strings.TrimSpace(eventID) == "" || strings.TrimSpace(query) == "" || mode != "rag" {
		return
	}
	h.prepareKnowledgeRequest(eventID)
	emit(map[string]any{
		"type":    "knowledge.query",
		"eventId": eventID,
		"roleId":  roleID,
		"query":   truncate(strings.TrimSpace(query), maxTextLength),
	})
}

func (h *harness) receiveKnowledgeContext(eventID string, matches []map[string]any, status, err string) {
	if eventID == "" {
		return
	}
	h.knowledgeMu.Lock()
	waiter := h.knowledgeWaiters[eventID]
	h.knowledgeMu.Unlock()
	if waiter == nil {
		emitLog("knowledge.context.late", map[string]any{"eventId": eventID})
		return
	}
	select {
	case waiter <- knowledgeResult{matches: matches, status: status, err: err}:
	default:
	}
}

func (h *harness) awaitKnowledgeContext(ctx context.Context, eventID string) knowledgeResult {
	h.mu.Lock()
	mode := h.cfg.KnowledgeMode
	h.mu.Unlock()
	return h.awaitKnowledgeContextWithMode(ctx, eventID, mode)
}

func (h *harness) awaitKnowledgeContextWithMode(ctx context.Context, eventID, mode string) knowledgeResult {
	if mode != "rag" || eventID == "" {
		return knowledgeResult{status: "disabled"}
	}
	h.knowledgeMu.Lock()
	waiter := h.knowledgeWaiters[eventID]
	h.knowledgeMu.Unlock()
	if waiter == nil {
		return knowledgeResult{status: "unavailable"}
	}
	timer := time.NewTimer(knowledgeWaitTimeout)
	defer timer.Stop()
	select {
	case result := <-waiter:
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		emitLog("knowledge.context.received", map[string]any{
			"eventId": eventID,
			"status":  result.status,
			"matches": len(result.matches),
		})
		return result
	case <-timer.C:
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		emitLog("knowledge.context.timeout", map[string]any{"eventId": eventID, "timeoutMs": knowledgeWaitTimeout.Milliseconds()})
		return knowledgeResult{status: "timeout"}
	case <-ctx.Done():
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		return knowledgeResult{status: "cancelled"}
	}
}
