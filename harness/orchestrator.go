package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type turnRequest struct {
	listen                  signal
	payload                 listenPayload
	initiativePrompt        string
	queuedAt                time.Time
	requestID               string
	sessionID               string
	generation              uint64
	ctx                     context.Context
	brainProfile            modelProfile
	speakProfile            modelProfile
	role                    map[string]any
	roleID                  string
	knowledgeMode           string
	knowledgeRetrievalMode  string
	knowledgeRequestID      string
	speakingEnabled         bool
	drawingEnabled          bool
	recentConversationCount int
	recentVisionCount       int
	conversationSummary     conversationSummary
	recentTurns             []conversationMessage
	recentVision            []*visionPayload
	seeEventIDs             []string
	visionStatus            string
	visionAgeMS             int64
}

func (h *harness) enqueueTurn(listen signal, payload listenPayload, initiativePrompt string) {
	h.enqueueTurnFromASR(nil, 0, listen, payload, initiativePrompt)
}

func (h *harness) enqueueTurnFromASR(client *asrClient, generation uint64, listen signal, payload listenPayload, initiativePrompt string) {
	turn, ok := h.snapshotTurnFromASR(client, generation, listen, payload, initiativePrompt)
	if !ok {
		emitLog("brain.request.discarded", map[string]any{"reason": "session_not_ready"})
		return
	}
	if !h.isTurnCurrent(turn) {
		emitLog("brain.request.discarded", map[string]any{"reason": "session_changed_before_dispatch"})
		return
	}
	h.prepareKnowledgeForTurn(turn)
	go h.processTurn(turn)
}

func (h *harness) handleCompletedListen(listen signal, payload listenPayload, initiativePrompt string) {
	turn, ok := h.snapshotTurn(listen, payload, initiativePrompt)
	if !ok {
		return
	}
	if !h.isTurnCurrent(turn) {
		return
	}
	h.prepareKnowledgeForTurn(turn)
	h.processTurn(turn)
}

func (h *harness) snapshotTurn(listen signal, payload listenPayload, initiativePrompt string) (turnRequest, bool) {
	return h.snapshotTurnFromASR(nil, 0, listen, payload, initiativePrompt)
}

func (h *harness) snapshotTurnFromASR(client *asrClient, generation uint64, listen signal, payload listenPayload, initiativePrompt string) (turnRequest, bool) {
	turn := turnRequest{
		listen:           listen,
		payload:          payload,
		initiativePrompt: initiativePrompt,
		queuedAt:         time.Now(),
		requestID:        newID("brain_request"),
	}
	h.mu.Lock()
	if h.ctx == nil || h.cfg.SessionID == "" || (client != nil && !h.isCurrentASRClientLocked(client)) || (client != nil && h.sessionGeneration != generation) {
		h.mu.Unlock()
		return turnRequest{}, false
	}
	turn.sessionID = h.cfg.SessionID
	turn.generation = h.sessionGeneration
	turnCtx, turnCancel := context.WithCancel(h.ctx)
	turn.ctx = turnCtx
	if h.turnCancels == nil {
		h.turnCancels = make(map[string]context.CancelFunc)
	}
	h.turnCancels[turn.requestID] = turnCancel
	turn.brainProfile = h.cfg.Models["brain"]
	turn.speakProfile = h.cfg.Models["speak"]
	turn.role = cloneStringMap(h.cfg.Role)
	turn.roleID = stringValue(h.cfg.Role["id"], "")
	turn.knowledgeMode = normalizeKnowledgeMode(h.cfg.KnowledgeMode)
	turn.knowledgeRetrievalMode = normalizeKnowledgeRetrievalMode(h.cfg.KnowledgeRetrievalMode)
	turn.knowledgeRequestID = newID("knowledge_request")
	turn.speakingEnabled = h.cfg.SpeakingEnabled
	turn.drawingEnabled = h.cfg.DrawingEnabled
	turn.recentConversationCount = h.cfg.RecentConversationCount
	turn.recentVisionCount = h.cfg.RecentVisionCount
	turn.conversationSummary = normalizeConversationSummary(h.conversationSummary)
	turn.recentTurns = recentHistorySnapshot(h.history, turn.recentConversationCount)
	h.mu.Unlock()

	turn.recentVision, turn.seeEventIDs, turn.visionStatus, turn.visionAgeMS = h.latestVisionSnapshots()
	if !h.isTurnCurrent(turn) || (client != nil && !h.isCurrentASRClient(client)) {
		h.unregisterTurn(turn.requestID)
		return turnRequest{}, false
	}
	return turn, true
}

func recentHistorySnapshot(history []conversationMessage, limit int) []conversationMessage {
	if limit <= 0 {
		limit = defaultRecentMessages
	}
	limit = clampInt(limit, 1, maxStoredMessages)
	start := 0
	if len(history) > limit {
		start = len(history) - limit
	}
	result := make([]conversationMessage, len(history[start:]))
	copy(result, history[start:])
	return result
}

func (h *harness) isTurnCurrent(turn turnRequest) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.sessionGeneration == turn.generation && h.cfg.SessionID == turn.sessionID
}

func (h *harness) unregisterTurn(requestID string) {
	if requestID == "" {
		return
	}
	h.mu.Lock()
	delete(h.turnCancels, requestID)
	h.mu.Unlock()
}

func (h *harness) prepareKnowledgeForTurn(turn turnRequest) {
	if turn.knowledgeMode != knowledgeModeRAG || turn.knowledgeRetrievalMode != knowledgeRetrievalModeFast {
		return
	}
	trigger := "listen"
	if strings.TrimSpace(turn.initiativePrompt) != "" {
		trigger = "initiative"
	}
	h.requestKnowledgeWithPlan(turn.knowledgeRequestID, turn.roleID, turn.knowledgeMode, knowledgePlan{Query: buildFastKnowledgeQuery(turn)}, knowledgeRequestMetadata{
		TurnID:         turn.requestID,
		BrainRequestID: turn.requestID,
		RoleID:         turn.roleID,
		Trigger:        trigger,
		RetrievalMode:  turn.knowledgeRetrievalMode,
	})
}

func (h *harness) handleInitiative(prompt string) {
	prompt = truncate(strings.TrimSpace(prompt), maxTextLength)
	if prompt == "" {
		emitLog("initiative.ignored", map[string]any{"reason": "empty"})
		return
	}
	h.mu.Lock()
	initiativeEnabled := h.cfg.InitiativeEnabled
	listeningEnabled := h.cfg.ListeningEnabled
	speakingEnabled := h.cfg.SpeakingEnabled
	h.mu.Unlock()
	if !initiativeEnabled {
		emitLog("initiative.ignored", map[string]any{
			"reason":            "disabled",
			"promptBytes":       len(prompt),
			"initiativeEnabled": initiativeEnabled,
		})
		return
	}
	if !listeningEnabled || !speakingEnabled {
		emitLog("initiative.ignored", map[string]any{
			"reason":           "capability_dependency_disabled",
			"promptBytes":      len(prompt),
			"listeningEnabled": listeningEnabled,
			"speakingEnabled":  speakingEnabled,
		})
		return
	}
	h.mu.Lock()
	ready := h.cancel != nil && h.ctx != nil && h.asr != nil
	sessionID := h.cfg.SessionID
	brainProfile := h.cfg.Models["brain"]
	h.mu.Unlock()
	if !ready {
		emitLog("initiative.ignored", map[string]any{
			"reason":      "session_not_ready",
			"promptBytes": len(prompt),
		})
		return
	}
	s := signal{
		Schema: protocolSchema, Version: protocolVersion, Type: "initiative.triggered",
		EventID: newID("evt_initiative"), SessionID: sessionID,
		CreatedAt: nowString(), Source: sourceFor("brain", brainProfile),
	}
	emitLog("initiative.triggered", map[string]any{
		"eventId":     s.EventID,
		"promptBytes": len(prompt),
	})
	h.enqueueTurn(s, listenPayload{}, prompt)
}

func (h *harness) processTurn(turn turnRequest) {
	defer h.unregisterTurn(turn.requestID)
	trigger := "listen"
	listenEventID := turn.listen.EventID
	if turn.initiativePrompt != "" {
		trigger = "initiative"
		listenEventID = ""
	}
	queuedAt := turn.queuedAt
	brainRequestID := turn.requestID
	knowledgeStatus := "disabled"
	knowledgeMatchCount := 0
	knowledgeUsed := false
	knowledgePlanStatus := "not_requested"
	deepRetrievalStatus := "not_requested"
	plannerRequestID := ""
	plannerResponseID := ""
	brainResponseID := ""
	brainStatus := "not_started"
	reasoningStages := make([]string, 0, 2)
	reasoningPresent := false
	reasoningContentBytes := 0
	reasoningTokens := int64(0)
	actionCount := 0
	actionTypes := []string{}
	addModelReasoning := func(stage string, response modelResponseDetails) {
		if strings.TrimSpace(response.ReasoningContent) == "" {
			return
		}
		reasoningPresent = true
		reasoningContentBytes += len(response.ReasoningContent)
		reasoningTokens += response.ReasoningTokens
		reasoningStages = append(reasoningStages, stage)
	}
	emitLog("brain.request.queued", map[string]any{
		"requestId":             brainRequestID,
		"turnId":                brainRequestID,
		"sessionId":             turn.sessionID,
		"trigger":               trigger,
		"listenEventId":         listenEventID,
		"triggerEventId":        turn.listen.EventID,
		"textBytes":             len(turn.payload.Text),
		"initiativePromptBytes": len(turn.initiativePrompt),
	})
	h.brainMu.Lock()
	lockAcquiredAt := time.Now()
	status := "started"
	brainLocked := true
	defer func() {
		if brainLocked {
			h.brainMu.Unlock()
		}
		emitLog("brain.request.finished", map[string]any{
			"requestId":       brainRequestID,
			"turnId":          brainRequestID,
			"sessionId":       turn.sessionID,
			"trigger":         trigger,
			"listenEventId":   listenEventID,
			"triggerEventId":  turn.listen.EventID,
			"status":          status,
			"queueWaitMs":     lockAcquiredAt.Sub(queuedAt).Milliseconds(),
			"totalDurationMs": durationMS(queuedAt),
		})
		emitLog("turn.completed", map[string]any{
			"requestId":              brainRequestID,
			"turnId":                 brainRequestID,
			"sessionId":              turn.sessionID,
			"trigger":                trigger,
			"listenEventId":          listenEventID,
			"inputTextBytes":         len(turn.payload.Text),
			"knowledgeMode":          turn.knowledgeMode,
			"knowledgeRetrievalMode": turn.knowledgeRetrievalMode,
			"knowledgeRequestId":     turn.knowledgeRequestID,
			"knowledgeStatus":        knowledgeStatus,
			"knowledgeMatchCount":    knowledgeMatchCount,
			"knowledgeUsed":          knowledgeUsed,
			"knowledgePlanStatus":    knowledgePlanStatus,
			"deepRetrievalStatus":    deepRetrievalStatus,
			"plannerRequestId":       plannerRequestID,
			"plannerResponseId":      plannerResponseID,
			"brainStatus":            brainStatus,
			"brainResponseId":        brainResponseID,
			"reasoningPresent":       reasoningPresent,
			"reasoningStages":        reasoningStages,
			"reasoningContentBytes":  reasoningContentBytes,
			"reasoningTokens":        reasoningTokens,
			"actionCount":            actionCount,
			"actionTypes":            actionTypes,
			"status":                 status,
			"totalDurationMs":        durationMS(queuedAt),
		})
	}()
	emitLog("brain.queue.acquired", map[string]any{
		"requestId":      brainRequestID,
		"trigger":        trigger,
		"listenEventId":  listenEventID,
		"triggerEventId": turn.listen.EventID,
		"queueWaitMs":    lockAcquiredAt.Sub(queuedAt).Milliseconds(),
	})
	if !h.isTurnCurrent(turn) {
		status = "stale"
		return
	}
	if turn.ctx != nil && turn.ctx.Err() != nil {
		status = "cancelled"
		return
	}
	recentVision := turn.recentVision
	seeEventIDs := turn.seeEventIDs
	visionStatus := turn.visionStatus
	visionAgeMS := turn.visionAgeMS
	var visual *visionPayload
	seeEventID := ""
	if len(recentVision) > 0 {
		visual = recentVision[len(recentVision)-1]
		seeEventID = seeEventIDs[len(seeEventIDs)-1]
	}
	emitLog("brain.vision.snapshot", map[string]any{
		"requestId":                   brainRequestID,
		"seeEventId":                  seeEventID,
		"status":                      visionStatus,
		"ageMs":                       visionAgeMS,
		"hasLatestVision":             visual != nil,
		"recentVisionCount":           len(recentVision),
		"configuredRecentVisionCount": turn.recentVisionCount,
		"waitMs":                      0,
	})
	conversationSummary := turn.conversationSummary
	recentTurns := append([]conversationMessage(nil), turn.recentTurns...)
	// The current utterance is included separately below. Avoid sending it
	// twice just because the transcript was recorded before Brain woke up.
	if len(recentTurns) > 0 {
		last := recentTurns[len(recentTurns)-1]
		if last.Role == "user" && last.Text == turn.payload.Text {
			recentTurns = recentTurns[:len(recentTurns)-1]
		}
	}

	userInput := map[string]any{
		"conversationSummary": conversationSummary,
		"recentTurns":         recentTurns,
		"latestVision":        visual,
		"recentVision":        recentVision,
		"recentVisionCount":   len(recentVision),
		"latestVisionStatus":  visionStatus,
		"latestVisionAgeMs":   visionAgeMS,
		"currentUserText":     turn.payload.Text,
		"trigger":             trigger,
		"sessionId":           turn.sessionID,
	}
	if turn.initiativePrompt != "" {
		userInput["initiativePrompt"] = turn.initiativePrompt
	}
	knowledge := knowledgeResult{status: "disabled"}
	var knowledgePlanResult *knowledgePlan
	var directAction *brainActionEnvelope
	if turn.knowledgeMode == knowledgeModeRAG {
		knowledgePlanStatus = "not_used"
		deepRetrievalStatus = "pending"
		switch turn.knowledgeRetrievalMode {
		case knowledgeRetrievalModeDeep:
			resolution := h.resolveDeepKnowledge(turn, trigger, brainRequestID, listenEventID, seeEventID, userInput)
			knowledge = resolution.Result
			knowledgePlanResult = resolution.Plan
			directAction = resolution.DirectAction
			plannerRequestID = resolution.PlannerRequestID
			plannerResponseID = resolution.ModelResponse.ResponseID
			addModelReasoning("knowledge.plan", resolution.ModelResponse)
			if resolution.Err != nil {
				knowledgePlanStatus = "fallback"
				deepRetrievalStatus = "fallback"
				emitLog("knowledge.plan.fallback", map[string]any{
					"requestId":          brainRequestID,
					"turnId":             brainRequestID,
					"plannerRequestId":   plannerRequestID,
					"knowledgeRequestId": turn.knowledgeRequestID,
					"trigger":            trigger,
					"error":              resolution.Err.Error(),
				})
				knowledge = knowledgeResult{status: "error", err: resolution.Err.Error()}
			} else if directAction != nil {
				knowledgePlanStatus = "direct_action"
				deepRetrievalStatus = "not_requested"
			} else if knowledgePlanResult != nil {
				knowledgePlanStatus = "search_selected"
				deepRetrievalStatus = knowledgeOutcome(knowledge)
			}
		default:
			knowledge = h.awaitKnowledgeContextWithTimeout(turn.ctx, turn.knowledgeRequestID, turn.knowledgeMode, knowledgeFastWaitTimeout)
			knowledgePlanStatus = "not_used"
			deepRetrievalStatus = knowledgeOutcome(knowledge)
		}
		knowledgeStatus = knowledge.status
		knowledgeMatchCount = len(knowledge.matches)
		knowledgeUsed = knowledgeStatusUsable(knowledge.status) && knowledgeMatchCount > 0
		if knowledgePlanResult != nil {
			userInput["knowledgePlan"] = knowledgePlanResult
		}
		userInput["knowledgeContext"] = knowledge.matches
		userInput["knowledgeStatus"] = knowledge.status
		if knowledge.err != "" {
			userInput["knowledgeError"] = truncate(knowledge.err, 500)
		}
	}
	if !h.isTurnCurrent(turn) {
		status = "stale"
		return
	}
	if turn.ctx != nil && turn.ctx.Err() != nil {
		status = "cancelled"
		return
	}
	encoded, _ := json.Marshal(userInput)
	var action brainActionEnvelope
	var content string
	var brainResponse modelResponseDetails
	var err error
	parseStartedAt := time.Now()
	if directAction != nil {
		action = *directAction
		brainStatus = "direct_action"
		emitLog("brain.model.skipped", map[string]any{
			"requestId":          brainRequestID,
			"turnId":             brainRequestID,
			"plannerRequestId":   plannerRequestID,
			"knowledgeRequestId": turn.knowledgeRequestID,
			"trigger":            trigger,
			"reason":             "deep_knowledge_planner_returned_action",
		})
	} else {
		brainMaxTokens := 4096
		brainStartedAt := time.Now()
		brainStatus = "started"
		emitLog("brain.model.started", map[string]any{
			"requestId":                         brainRequestID,
			"turnId":                            brainRequestID,
			"sessionId":                         turn.sessionID,
			"trigger":                           trigger,
			"listenEventId":                     listenEventID,
			"triggerEventId":                    turn.listen.EventID,
			"model":                             turn.brainProfile.Name,
			"recentTurnCount":                   len(recentTurns),
			"configuredRecentConversationCount": turn.recentConversationCount,
			"userTextBytes":                     len(turn.payload.Text),
			"requestBytes":                      len(encoded),
			"hasLatestVision":                   visual != nil,
			"recentVisionCount":                 len(recentVision),
			"configuredRecentVisionCount":       turn.recentVisionCount,
			"seeEventId":                        seeEventID,
			"maxTokens":                         brainMaxTokens,
			"initiativePromptBytes":             len(turn.initiativePrompt),
			"conversationSummaryChars":          summaryContentLength(conversationSummary),
			"knowledgeMode":                     turn.knowledgeMode,
			"knowledgeRetrievalMode":            turn.knowledgeRetrievalMode,
			"knowledgeMatchCount":               len(knowledge.matches),
			"knowledgeStatus":                   knowledge.status,
			"knowledgeUsed":                     knowledgeStatusUsable(knowledge.status) && len(knowledge.matches) > 0,
			"knowledgeRequestId":                turn.knowledgeRequestID,
			"plannerRequestId":                  plannerRequestID,
		})
		content, brainResponse, err = h.callJSONModelContextWithDetails(turn.ctx, turn.sessionID, turn.brainProfile, "brain", brainRequestID, buildRoleSystemPrompt(turn.role), string(encoded), &brainMaxTokens)
		brainResponseID = brainResponse.ResponseID
		addModelReasoning("brain", brainResponse)
		if !h.isTurnCurrent(turn) {
			status = "stale"
			return
		}
		if turn.ctx != nil && turn.ctx.Err() != nil {
			status = "cancelled"
			return
		}
		brainDurationMS := durationMS(brainStartedAt)
		if err != nil {
			brainStatus = "failed"
			status = "brain_failed"
			emitLog("brain.model.failed", map[string]any{
				"requestId":  brainRequestID,
				"turnId":     brainRequestID,
				"sessionId":  turn.sessionID,
				"trigger":    trigger,
				"model":      turn.brainProfile.Name,
				"durationMs": brainDurationMS,
				"error":      err.Error(),
			})
			h.recordLatency("brain", brainDurationMS)
			h.logActionFailure("brain", "", "BRAIN_FAILED", err.Error())
			emitBridgeError(fmt.Sprintf("Brain 请求失败：%v", err))
			return
		}
		brainStatus = "completed"
		emitLog("brain.model.completed", map[string]any{
			"requestId":             brainRequestID,
			"turnId":                brainRequestID,
			"sessionId":             turn.sessionID,
			"model":                 turn.brainProfile.Name,
			"durationMs":            brainDurationMS,
			"contentBytes":          len(content),
			"reasoningPresent":      strings.TrimSpace(brainResponse.ReasoningContent) != "",
			"reasoningContentBytes": len(brainResponse.ReasoningContent),
			"reasoningTokens":       brainResponse.ReasoningTokens,
		})
		h.recordLatency("brain", brainDurationMS)
		parseStartedAt = time.Now()
		action, err = parseBrainAction(content, turn.sessionID, listenEventID, seeEventID)
		if err != nil {
			brainStatus = "invalid_action"
			status = "brain_invalid_action"
			emitLog("brain.parse.failed", map[string]any{
				"requestId":       brainRequestID,
				"turnId":          brainRequestID,
				"sessionId":       turn.sessionID,
				"parseDurationMs": durationMS(parseStartedAt),
				"totalDurationMs": durationMS(brainStartedAt),
				"contentBytes":    len(content),
				"error":           err.Error(),
			})
			emitDebugLog("brain.parse.output", map[string]any{
				"requestId":  brainRequestID,
				"turnId":     brainRequestID,
				"sessionId":  turn.sessionID,
				"content":    truncateRunes(content, 12000),
				"parseError": err.Error(),
			})
			h.logActionFailure("brain", "", "BRAIN_INVALID_ACTION", err.Error())
			return
		}
	}
	actionTypes = make([]string, 0, len(action.Actions))
	for _, item := range action.Actions {
		actionTypes = append(actionTypes, item.Type)
	}
	emitLog("brain.parse.completed", map[string]any{
		"requestId":       brainRequestID,
		"turnId":          brainRequestID,
		"sessionId":       turn.sessionID,
		"parseDurationMs": durationMS(parseStartedAt),
		"actionCount":     len(action.Actions),
		"actionTypes":     actionTypes,
		"hasSpeak":        hasActionType(action.Actions, "speak"),
	})
	actionCount = len(action.Actions)
	actionTypes = append([]string(nil), actionTypes...)
	brainStatus = "parsed"
	if !h.isTurnCurrent(turn) {
		status = "stale"
		return
	}
	action.ReplyTo = actionReplyTo{ListenEventID: listenEventID, SeeEventID: seeEventID}
	action.CreatedAt = nowString()
	action.EventID = newID("evt_action")
	action.Schema = brainActionSchema
	action.Version = protocolVersion
	action.Type = "brain.action"
	action.SessionID = turn.sessionID
	status = "action_emitted"
	brainStatus = "action_emitted"
	emitLog("brain.action.emitted", map[string]any{
		"requestId":      brainRequestID,
		"eventId":        action.EventID,
		"trigger":        trigger,
		"listenEventId":  listenEventID,
		"triggerEventId": turn.listen.EventID,
		"seeEventId":     seeEventID,
		"actionCount":    len(action.Actions),
		"actionTypes":    actionTypes,
	})
	emit(action)
	h.brainMu.Unlock()
	brainLocked = false
	h.actionExecMu.Lock()
	defer h.actionExecMu.Unlock()
	if !h.isTurnCurrent(turn) {
		status = "stale"
		return
	}
	for _, item := range action.Actions {
		if !h.executeTurnAction(turn, item) {
			status = "stale"
			return
		}
	}
	if !h.isTurnCurrent(turn) {
		status = "stale"
		return
	}
	status = "actions_executed"
	brainStatus = "actions_executed"
	emitLog("assistant.response.done", map[string]any{
		"requestId":       brainRequestID,
		"actionCount":     len(action.Actions),
		"actionTypes":     actionTypes,
		"speakingEnabled": turn.speakingEnabled,
	})
	outputTypes := []string{"text", "harness_action"}
	if turn.speakingEnabled {
		outputTypes = append(outputTypes, "audio")
	}
	emit(map[string]any{"type": "assistant.response.done", "outputTypes": outputTypes})
}
