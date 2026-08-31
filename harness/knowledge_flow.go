package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// knowledgePlan is the only part of a deep retrieval decision that the
// model is allowed to choose. Runtime-owned values such as roleId, topK,
// score thresholds, and permissions never cross this boundary.
type knowledgePlan struct {
	Type   string   `json:"type"`
	Query  string   `json:"query"`
	Intent string   `json:"intent,omitempty"`
	Focus  []string `json:"focus,omitempty"`
}

type deepKnowledgeDecision struct {
	Plan         *knowledgePlan
	DirectAction *brainActionEnvelope
}

type deepKnowledgeResolution struct {
	Result           knowledgeResult
	Plan             *knowledgePlan
	DirectAction     *brainActionEnvelope
	PlannerRequestID string
	ModelResponse    modelResponseDetails
	Err              error
}

func turnInputText(turn turnRequest) string {
	if prompt := strings.TrimSpace(turn.initiativePrompt); prompt != "" {
		return prompt
	}
	return strings.TrimSpace(turn.payload.Text)
}

// buildFastKnowledgeQuery deliberately stays deterministic. A second model
// call to decide which history is relevant would defeat the low-latency path.
// The normal conversation snapshot remains available to Brain separately;
// this smaller window is only for embedding retrieval.
func buildFastKnowledgeQuery(turn turnRequest) string {
	var builder strings.Builder
	write := func(label, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		builder.WriteString(label)
		builder.WriteString("：\n")
		builder.WriteString(value)
		builder.WriteString("\n\n")
	}

	write("当前输入", turnInputText(turn))
	if summary, err := json.Marshal(turn.conversationSummary); err == nil {
		write("对话摘要", string(summary))
	}

	recent := turn.recentTurns
	if len(recent) > knowledgeFastRecentMessages {
		recent = recent[len(recent)-knowledgeFastRecentMessages:]
	}
	if len(recent) > 0 {
		var history strings.Builder
		for _, message := range recent {
			text := strings.TrimSpace(message.Text)
			if text == "" {
				continue
			}
			role := "助手"
			if message.Role == "user" {
				role = "用户"
			}
			history.WriteString(role)
			history.WriteString("：")
			history.WriteString(text)
			history.WriteString("\n")
		}
		write("最近对话", history.String())
	}

	return truncateRunes(builder.String(), knowledgeFastQueryMaxChars)
}

func parseDeepKnowledgeDecision(raw, sessionID, listenEventID, seeEventID string) (deepKnowledgeDecision, error) {
	var envelope struct {
		Type    string        `json:"type"`
		Query   string        `json:"query"`
		Intent  string        `json:"intent"`
		Focus   []string      `json:"focus"`
		Actions []brainAction `json:"actions"`
	}
	if err := json.Unmarshal([]byte(extractJSONObject(raw)), &envelope); err != nil {
		return deepKnowledgeDecision{}, err
	}

	switch strings.ToLower(strings.TrimSpace(envelope.Type)) {
	case "knowledge.search":
		query := strings.TrimSpace(envelope.Query)
		if query == "" {
			return deepKnowledgeDecision{}, fmt.Errorf("knowledge.search.query 不能为空")
		}
		focus := make([]string, 0, len(envelope.Focus))
		for _, item := range envelope.Focus {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			focus = append(focus, truncateRunes(item, 120))
			if len(focus) == 8 {
				break
			}
		}
		return deepKnowledgeDecision{Plan: &knowledgePlan{
			Type:   "knowledge.search",
			Query:  truncateRunes(query, maxTextLength),
			Intent: truncateRunes(strings.TrimSpace(envelope.Intent), 120),
			Focus:  focus,
		}}, nil
	case "brain.action":
		if len(envelope.Actions) == 0 {
			return deepKnowledgeDecision{}, fmt.Errorf("brain.action.actions 不能为空")
		}
		action, err := parseBrainAction(raw, sessionID, listenEventID, seeEventID)
		if err != nil {
			return deepKnowledgeDecision{}, err
		}
		return deepKnowledgeDecision{DirectAction: &action}, nil
	default:
		return deepKnowledgeDecision{}, fmt.Errorf("深度检索阶段不支持的输出类型：%q", envelope.Type)
	}
}

func cloneUserInput(input map[string]any) map[string]any {
	clone := make(map[string]any, len(input)+1)
	for key, value := range input {
		clone[key] = value
	}
	return clone
}

func (h *harness) resolveDeepKnowledge(turn turnRequest, trigger, brainRequestID, listenEventID, seeEventID string, baseInput map[string]any) deepKnowledgeResolution {
	plannerInput := cloneUserInput(baseInput)
	plannerInput["knowledgeStage"] = "planning"
	encoded, err := json.Marshal(plannerInput)
	if err != nil {
		return deepKnowledgeResolution{Err: err}
	}

	knowledgeEventID := turn.knowledgeRequestID
	if knowledgeEventID == "" {
		knowledgeEventID = turn.listen.EventID
	}
	plannerRequestID := newID("knowledge_plan")
	plannerStartedAt := time.Now()
	emitLog("knowledge.plan.started", map[string]any{
		"requestId":          brainRequestID,
		"turnId":             brainRequestID,
		"plannerRequestId":   plannerRequestID,
		"knowledgeRequestId": knowledgeEventID,
		"roleId":             turn.roleID,
		"trigger":            trigger,
		"listenEventId":      listenEventID,
		"seeEventId":         seeEventID,
		"requestBytes":       len(encoded),
	})
	maxTokens := knowledgePlannerMaxTokens
	content, modelResponse, err := h.callJSONModelContextWithDetails(
		turn.ctx,
		turn.sessionID,
		turn.brainProfile,
		"knowledge.plan",
		plannerRequestID,
		buildKnowledgePlannerSystemPrompt(turn.role),
		string(encoded),
		&maxTokens,
	)
	if err != nil {
		emitLog("knowledge.plan.failed", map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": knowledgeEventID,
			"roleId":             turn.roleID,
			"durationMs":         durationMS(plannerStartedAt),
			"error":              err.Error(),
		})
		return deepKnowledgeResolution{
			PlannerRequestID: plannerRequestID,
			ModelResponse:    modelResponse,
			Err:              err,
		}
	}
	emitLog("knowledge.plan.completed", map[string]any{
		"requestId":             brainRequestID,
		"turnId":                brainRequestID,
		"plannerRequestId":      plannerRequestID,
		"knowledgeRequestId":    knowledgeEventID,
		"roleId":                turn.roleID,
		"durationMs":            durationMS(plannerStartedAt),
		"contentBytes":          len(content),
		"finishReasons":         modelResponse.FinishReasons,
		"reasoningPresent":      strings.TrimSpace(modelResponse.ReasoningContent) != "",
		"reasoningContentBytes": len(modelResponse.ReasoningContent),
		"reasoningTokens":       modelResponse.ReasoningTokens,
	})

	decision, err := parseDeepKnowledgeDecision(content, turn.sessionID, listenEventID, seeEventID)
	if err != nil {
		emitLog("knowledge.plan.invalid", map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": knowledgeEventID,
			"roleId":             turn.roleID,
			"error":              err.Error(),
		})
		emitDebugLog("knowledge.plan.output", map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": knowledgeEventID,
			"roleId":             turn.roleID,
			"content":            truncate(content, 12000),
			"parseError":         err.Error(),
		})
		return deepKnowledgeResolution{
			PlannerRequestID: plannerRequestID,
			ModelResponse:    modelResponse,
			Err:              err,
		}
	}
	if decision.DirectAction != nil {
		emitLog("knowledge.plan.selected", map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": knowledgeEventID,
			"roleId":             turn.roleID,
			"trigger":            trigger,
			"decision":           "direct_action",
			"actionCount":        len(decision.DirectAction.Actions),
		})
		detailFields := map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": knowledgeEventID,
			"decision":           "direct_action",
			"action":             decision.DirectAction,
		}
		emitDebugLog("knowledge.plan.result", detailFields)
		return deepKnowledgeResolution{
			Result:           knowledgeResult{status: "not_requested"},
			DirectAction:     decision.DirectAction,
			PlannerRequestID: plannerRequestID,
			ModelResponse:    modelResponse,
		}
	}

	emitLog("knowledge.plan.selected", map[string]any{
		"requestId":          brainRequestID,
		"turnId":             brainRequestID,
		"plannerRequestId":   plannerRequestID,
		"knowledgeRequestId": knowledgeEventID,
		"roleId":             turn.roleID,
		"trigger":            trigger,
		"decision":           "knowledge_search",
		"queryBytes":         len(decision.Plan.Query),
		"intent":             decision.Plan.Intent,
		"focus":              decision.Plan.Focus,
	})
	emitDebugLog("knowledge.plan.result", map[string]any{
		"requestId":          brainRequestID,
		"turnId":             brainRequestID,
		"plannerRequestId":   plannerRequestID,
		"knowledgeRequestId": knowledgeEventID,
		"decision":           "knowledge_search",
		"plan":               decision.Plan,
	})
	h.requestKnowledgeWithPlan(knowledgeEventID, turn.roleID, turn.knowledgeMode, *decision.Plan, knowledgeRequestMetadata{
		TurnID:           brainRequestID,
		BrainRequestID:   brainRequestID,
		PlannerRequestID: plannerRequestID,
		RoleID:           turn.roleID,
		Trigger:          trigger,
		RetrievalMode:    turn.knowledgeRetrievalMode,
	})
	result := h.awaitKnowledgeContextWithMode(turn.ctx, knowledgeEventID, turn.knowledgeMode)
	return deepKnowledgeResolution{
		Result:           result,
		Plan:             decision.Plan,
		PlannerRequestID: plannerRequestID,
		ModelResponse:    modelResponse,
	}
}
