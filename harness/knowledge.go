package main

import (
	"context"
	"strings"
	"time"
)

const knowledgeWaitTimeout = 2500 * time.Millisecond

const (
	knowledgeModeNone   = "none"
	knowledgeModePrompt = "prompt"
	knowledgeModeRAG    = "rag"

	knowledgeRetrievalModeFast = "fast"
	knowledgeRetrievalModeDeep = "deep"
)

func normalizeKnowledgeMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case knowledgeModeNone:
		return knowledgeModeNone
	case knowledgeModeRAG:
		return knowledgeModeRAG
	default:
		// Preserve the pre-existing behavior for roles created before the
		// explicit "none" mode was introduced.
		return knowledgeModePrompt
	}
}

func normalizeKnowledgeRetrievalMode(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), knowledgeRetrievalModeDeep) {
		return knowledgeRetrievalModeDeep
	}
	return knowledgeRetrievalModeFast
}

type knowledgeResult struct {
	matches  []map[string]any
	status   string
	err      string
	metadata knowledgeRequestMetadata
}

type knowledgeRequestMetadata struct {
	TurnID           string
	BrainRequestID   string
	PlannerRequestID string
	RoleID           string
	Trigger          string
	RetrievalMode    string
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
	h.requestKnowledgeWithPlan(eventID, roleID, mode, knowledgePlan{Query: query}, knowledgeRequestMetadata{RoleID: roleID})
}

func (h *harness) requestKnowledgeWithPlan(eventID, roleID, mode string, plan knowledgePlan, metadata knowledgeRequestMetadata) {
	query := strings.TrimSpace(plan.Query)
	metadata.RoleID = roleID
	metadata.BrainRequestID = strings.TrimSpace(metadata.BrainRequestID)
	metadata.PlannerRequestID = strings.TrimSpace(metadata.PlannerRequestID)
	metadata.TurnID = strings.TrimSpace(metadata.TurnID)
	metadata.Trigger = strings.TrimSpace(metadata.Trigger)
	if strings.TrimSpace(eventID) == "" || strings.TrimSpace(query) == "" || normalizeKnowledgeMode(mode) != knowledgeModeRAG {
		emitLog("knowledge.query.rejected", map[string]any{
			"turnId":             metadata.TurnID,
			"brainRequestId":     metadata.BrainRequestID,
			"plannerRequestId":   metadata.PlannerRequestID,
			"knowledgeRequestId": eventID,
			"roleId":             roleID,
			"reason":             "invalid_request",
			"hasQuery":           query != "",
			"knowledgeMode":      normalizeKnowledgeMode(mode),
		})
		return
	}
	h.prepareKnowledgeRequest(eventID)
	fields := map[string]any{
		"turnId":             metadata.TurnID,
		"brainRequestId":     metadata.BrainRequestID,
		"plannerRequestId":   metadata.PlannerRequestID,
		"knowledgeRequestId": eventID,
		"roleId":             roleID,
		"trigger":            metadata.Trigger,
		"retrievalMode":      normalizeKnowledgeRetrievalMode(metadata.RetrievalMode),
		"queryBytes":         len(query),
		"intent":             truncateRunes(strings.TrimSpace(plan.Intent), 120),
		"focus":              plan.Focus,
	}
	emitLog("knowledge.query.requested", fields)
	detailFields := map[string]any{}
	for key, value := range fields {
		detailFields[key] = value
	}
	detailFields["query"] = truncateRunes(query, maxTextLength)
	emitDebugLog("knowledge.query.details", detailFields)
	emit(map[string]any{
		"type":               "knowledge.query",
		"eventId":            eventID,
		"knowledgeRequestId": eventID,
		"turnId":             metadata.TurnID,
		"brainRequestId":     metadata.BrainRequestID,
		"plannerRequestId":   metadata.PlannerRequestID,
		"roleId":             roleID,
		"trigger":            metadata.Trigger,
		"retrievalMode":      normalizeKnowledgeRetrievalMode(metadata.RetrievalMode),
		"query":              truncateRunes(query, maxTextLength),
		"intent":             truncateRunes(strings.TrimSpace(plan.Intent), 120),
		"focus":              plan.Focus,
	})
}

func (h *harness) receiveKnowledgeContext(eventID string, matches []map[string]any, status, err string) {
	h.receiveKnowledgeContextWithMetadata(eventID, matches, status, err, knowledgeRequestMetadata{})
}

func (h *harness) receiveKnowledgeContextWithMetadata(eventID string, matches []map[string]any, status, err string, metadata knowledgeRequestMetadata) {
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
	case waiter <- knowledgeResult{matches: matches, status: status, err: err, metadata: metadata}:
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
	return h.awaitKnowledgeContextWithTimeout(ctx, eventID, mode, knowledgeWaitTimeout)
}

func (h *harness) awaitKnowledgeContextWithTimeout(ctx context.Context, eventID, mode string, timeout time.Duration) knowledgeResult {
	if normalizeKnowledgeMode(mode) != knowledgeModeRAG || eventID == "" {
		return knowledgeResult{status: "disabled"}
	}
	h.knowledgeMu.Lock()
	waiter := h.knowledgeWaiters[eventID]
	h.knowledgeMu.Unlock()
	if waiter == nil {
		emitLog("knowledge.context.unavailable", map[string]any{
			"knowledgeRequestId": eventID,
			"reason":             "unknown_event",
		})
		return knowledgeResult{status: "unavailable"}
	}
	if timeout <= 0 {
		timeout = knowledgeWaitTimeout
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case result := <-waiter:
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		emitLog("knowledge.context.received", map[string]any{
			"eventId":            eventID,
			"knowledgeRequestId": eventID,
			"turnId":             result.metadata.TurnID,
			"brainRequestId":     result.metadata.BrainRequestID,
			"plannerRequestId":   result.metadata.PlannerRequestID,
			"roleId":             result.metadata.RoleID,
			"trigger":            result.metadata.Trigger,
			"status":             result.status,
			"matches":            len(result.matches),
			"knowledgeUsed":      knowledgeStatusUsable(result.status) && len(result.matches) > 0,
		})
		return result
	case <-timer.C:
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		emitLog("knowledge.context.timeout", map[string]any{
			"eventId":            eventID,
			"knowledgeRequestId": eventID,
			"timeoutMs":          timeout.Milliseconds(),
		})
		return knowledgeResult{status: "timeout"}
	case <-ctx.Done():
		h.knowledgeMu.Lock()
		if h.knowledgeWaiters[eventID] == waiter {
			delete(h.knowledgeWaiters, eventID)
		}
		h.knowledgeMu.Unlock()
		emitLog("knowledge.context.cancelled", map[string]any{
			"eventId":            eventID,
			"knowledgeRequestId": eventID,
			"reason":             "turn_context_done",
		})
		return knowledgeResult{status: "cancelled"}
	}
}

func knowledgeStatusUsable(status string) bool {
	return status == "ready" || status == "ready_with_errors"
}

func knowledgeOutcome(result knowledgeResult) string {
	if knowledgeStatusUsable(result.status) {
		if len(result.matches) > 0 {
			return "used"
		}
		return "no_match"
	}
	switch result.status {
	case "timeout":
		return "timeout"
	case "cancelled":
		return "cancelled"
	case "unavailable":
		return "unavailable"
	case "error":
		return "error"
	default:
		return result.status
	}
}
