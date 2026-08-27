package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (h *harness) handleInitiative(prompt string) {
	prompt = truncate(strings.TrimSpace(prompt), maxTextLength)
	if prompt == "" {
		emitLog("initiative.ignored", map[string]any{"reason": "empty"})
		return
	}
	if !h.cfg.InitiativeEnabled {
		emitLog("initiative.ignored", map[string]any{
			"reason":            "disabled",
			"promptBytes":       len(prompt),
			"initiativeEnabled": h.cfg.InitiativeEnabled,
		})
		return
	}
	if !h.cfg.ListeningEnabled || !h.cfg.SpeakingEnabled {
		emitLog("initiative.ignored", map[string]any{
			"reason":           "capability_dependency_disabled",
			"promptBytes":      len(prompt),
			"listeningEnabled": h.cfg.ListeningEnabled,
			"speakingEnabled":  h.cfg.SpeakingEnabled,
		})
		return
	}
	h.mu.Lock()
	ready := h.cancel != nil && h.ctx != nil && h.asr != nil
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
		EventID: newID("evt_initiative"), SessionID: h.cfg.SessionID,
		CreatedAt: nowString(), Source: sourceFor("brain", h.cfg.Models["brain"]),
	}
	emitLog("initiative.triggered", map[string]any{
		"eventId":     s.EventID,
		"promptBytes": len(prompt),
	})
	go h.handleCompletedListen(s, listenPayload{}, prompt)
}

func (h *harness) handleCompletedListen(listen signal, payload listenPayload, initiativePrompt string) {
	trigger := "listen"
	listenEventID := listen.EventID
	if initiativePrompt != "" {
		trigger = "initiative"
		listenEventID = ""
	}
	queuedAt := time.Now()
	brainRequestID := newID("brain_request")
	emitLog("brain.request.queued", map[string]any{
		"requestId":             brainRequestID,
		"trigger":               trigger,
		"listenEventId":         listenEventID,
		"triggerEventId":        listen.EventID,
		"textBytes":             len(payload.Text),
		"initiativePromptBytes": len(initiativePrompt),
	})
	h.brainMu.Lock()
	lockAcquiredAt := time.Now()
	status := "started"
	defer func() {
		emitLog("brain.request.finished", map[string]any{
			"requestId":       brainRequestID,
			"trigger":         trigger,
			"listenEventId":   listenEventID,
			"triggerEventId":  listen.EventID,
			"status":          status,
			"queueWaitMs":     lockAcquiredAt.Sub(queuedAt).Milliseconds(),
			"totalDurationMs": durationMS(queuedAt),
		})
		h.brainMu.Unlock()
	}()
	emitLog("brain.queue.acquired", map[string]any{
		"requestId":      brainRequestID,
		"trigger":        trigger,
		"listenEventId":  listenEventID,
		"triggerEventId": listen.EventID,
		"queueWaitMs":    lockAcquiredAt.Sub(queuedAt).Milliseconds(),
	})

	recentVision, seeEventIDs, visionStatus, visionAgeMS := h.latestVisionSnapshots()
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
		"configuredRecentVisionCount": h.cfg.RecentVisionCount,
		"waitMs":                      0,
	})
	recentTurns := h.recentHistory(h.cfg.RecentConversationCount)
	// The current utterance is included separately below. Avoid sending it
	// twice just because the transcript was recorded before Brain woke up.
	if len(recentTurns) > 0 {
		last := recentTurns[len(recentTurns)-1]
		if last.Role == "user" && last.Text == payload.Text {
			recentTurns = recentTurns[:len(recentTurns)-1]
		}
	}

	userInput := map[string]any{
		"recentTurns":        recentTurns,
		"latestVision":       visual,
		"recentVision":       recentVision,
		"recentVisionCount":  len(recentVision),
		"latestVisionStatus": visionStatus,
		"latestVisionAgeMs":  visionAgeMS,
		"currentUserText":    payload.Text,
		"trigger":            trigger,
		"sessionId":          h.cfg.SessionID,
	}
	if initiativePrompt != "" {
		userInput["initiativePrompt"] = initiativePrompt
	}
	encoded, _ := json.Marshal(userInput)
	brainMaxTokens := 1800
	brainStartedAt := time.Now()
	emitLog("brain.model.started", map[string]any{
		"requestId":                         brainRequestID,
		"trigger":                           trigger,
		"listenEventId":                     listenEventID,
		"triggerEventId":                    listen.EventID,
		"model":                             h.cfg.Models["brain"].Name,
		"recentTurnCount":                   len(recentTurns),
		"configuredRecentConversationCount": h.cfg.RecentConversationCount,
		"userTextBytes":                     len(payload.Text),
		"requestBytes":                      len(encoded),
		"hasLatestVision":                   visual != nil,
		"recentVisionCount":                 len(recentVision),
		"configuredRecentVisionCount":       h.cfg.RecentVisionCount,
		"seeEventId":                        seeEventID,
		"maxTokens":                         brainMaxTokens,
		"initiativePromptBytes":             len(initiativePrompt),
	})
	content, err := h.callJSONModel(h.cfg.Models["brain"], "brain", brainRequestID, buildRoleSystemPrompt(h.cfg.Role), string(encoded), &brainMaxTokens)
	if err != nil {
		status = "brain_failed"
		emitLog("brain.model.failed", map[string]any{
			"requestId":  brainRequestID,
			"trigger":    trigger,
			"model":      h.cfg.Models["brain"].Name,
			"durationMs": durationMS(brainStartedAt),
			"error":      err.Error(),
		})
		h.logActionFailure("brain", "", "BRAIN_FAILED", err.Error())
		emitBridgeError(fmt.Sprintf("Brain 请求失败：%v", err))
		return
	}
	emitLog("brain.model.completed", map[string]any{
		"requestId":    brainRequestID,
		"model":        h.cfg.Models["brain"].Name,
		"durationMs":   durationMS(brainStartedAt),
		"contentBytes": len(content),
	})
	parseStartedAt := time.Now()
	action, err := parseBrainAction(content, h.cfg.SessionID, listenEventID, seeEventID)
	if err != nil {
		status = "brain_invalid_action"
		emitLog("brain.parse.failed", map[string]any{
			"requestId":       brainRequestID,
			"parseDurationMs": durationMS(parseStartedAt),
			"totalDurationMs": durationMS(brainStartedAt),
			"contentBytes":    len(content),
			"contentPreview":  truncate(content, 4000),
			"error":           err.Error(),
		})
		h.logActionFailure("brain", "", "BRAIN_INVALID_ACTION", err.Error())
		return
	}
	actionTypes := make([]string, 0, len(action.Actions))
	for _, item := range action.Actions {
		actionTypes = append(actionTypes, item.Type)
	}
	emitLog("brain.parse.completed", map[string]any{
		"requestId":       brainRequestID,
		"parseDurationMs": durationMS(parseStartedAt),
		"actionCount":     len(action.Actions),
		"actionTypes":     actionTypes,
		"hasSpeak":        hasActionType(action.Actions, "speak"),
	})
	action.ReplyTo = actionReplyTo{ListenEventID: listenEventID, SeeEventID: seeEventID}
	action.CreatedAt = nowString()
	action.EventID = newID("evt_action")
	action.Schema = brainActionSchema
	action.Version = protocolVersion
	action.Type = "brain.action"
	action.SessionID = h.cfg.SessionID
	status = "action_emitted"
	emitLog("brain.action.emitted", map[string]any{
		"requestId":      brainRequestID,
		"eventId":        action.EventID,
		"trigger":        trigger,
		"listenEventId":  listenEventID,
		"triggerEventId": listen.EventID,
		"seeEventId":     seeEventID,
		"actionCount":    len(action.Actions),
		"actionTypes":    actionTypes,
	})
	emit(action)
	for _, item := range action.Actions {
		h.executeAction(item)
	}
	status = "actions_executed"
	emitLog("assistant.response.done", map[string]any{
		"requestId":       brainRequestID,
		"actionCount":     len(action.Actions),
		"actionTypes":     actionTypes,
		"speakingEnabled": h.cfg.SpeakingEnabled,
	})
	outputTypes := []string{"text", "harness_action"}
	if h.cfg.SpeakingEnabled {
		outputTypes = append(outputTypes, "audio")
	}
	emit(map[string]any{"type": "assistant.response.done", "outputTypes": outputTypes})
}

func hasActionType(actions []brainAction, actionType string) bool {
	for _, action := range actions {
		if action.Type == actionType {
			return true
		}
	}
	return false
}

func (h *harness) recentHistory(limit int) []conversationMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	if limit <= 0 {
		limit = defaultRecentMessages
	}
	limit = clampInt(limit, 1, maxStoredMessages)
	start := 0
	if len(h.history) > limit {
		start = len(h.history) - limit
	}
	result := make([]conversationMessage, len(h.history[start:]))
	copy(result, h.history[start:])
	return result
}

func (h *harness) executeAction(action brainAction) {
	switch action.Type {
	case "speak":
		text := strings.TrimSpace(action.Text)
		if text == "" {
			emitLog("speak.failed", map[string]any{
				"actionId": action.ActionID,
				"code":     "SPEAK_TEXT_EMPTY",
			})
			h.logActionFailure("speak", action.ActionID, "SPEAK_TEXT_EMPTY", "speak.text 不能为空")
			return
		}
		if !h.cfg.SpeakingEnabled {
			emitLog("speak.skipped", map[string]any{
				"actionId":  action.ActionID,
				"textBytes": len(text),
				"reason":    "capability_disabled",
			})
			// Keep text output and conversation history available when voice
			// output is disabled, but never open a TTS connection.
			emit(map[string]any{"type": "assistant.text.delta", "text": text})
			h.appendHistory("assistant", text)
			emit(map[string]any{"type": "assistant.text.done", "text": text})
			return
		}
		speakStartedAt := time.Now()
		emitLog("speak.started", map[string]any{
			"actionId":  action.ActionID,
			"textBytes": len(text),
			"model":     h.cfg.Models["speak"].Name,
		})
		emit(map[string]any{"type": "assistant.text.delta", "text": text})
		if err := h.speak(text); err != nil {
			emitLog("speak.failed", map[string]any{
				"actionId":   action.ActionID,
				"durationMs": durationMS(speakStartedAt),
				"error":      err.Error(),
			})
			h.logActionFailure("speak", action.ActionID, "SPEAK_FAILED", err.Error())
			return
		}
		emitLog("speak.completed", map[string]any{
			"actionId":   action.ActionID,
			"durationMs": durationMS(speakStartedAt),
			"textBytes":  len(text),
		})
		h.appendHistory("assistant", text)
		emit(map[string]any{"type": "assistant.text.done", "text": text})
	case "draw":
		if !h.cfg.DrawingEnabled {
			emitLog("draw.failed", map[string]any{
				"actionId": action.ActionID,
				"code":     "DRAW_DISABLED",
			})
			h.logActionFailure("draw", action.ActionID, "DRAW_DISABLED", "当前角色或捕获来源未启用绘画")
			return
		}
		h.executeDraw(action)
	default:
		h.logActionFailure(action.Type, action.ActionID, "ACTION_UNSUPPORTED", "不支持的 Brain action 类型")
	}
}

func (h *harness) speak(text string) error {
	profile := h.cfg.Models["speak"]
	socket, err := dialRealtime(profile, defaultSpeakURL)
	if err != nil {
		return err
	}
	defer socket.close()
	configuredRoleVoice := roleVoice(h.cfg.Role)
	voice, voiceSource := resolveSpeakVoice(profile.Name, configuredRoleVoice, profile.Voice)
	speechStyle := roleSpeechStyle(h.cfg.Role)
	styleApplied := speechStyle != "" && supportsTTSInstructions(profile.Name)
	if configuredRoleVoice != "" && voiceSource != "role" {
		emitLog("speak.voice.fallback", map[string]any{
			"model":          profile.Name,
			"requestedVoice": configuredRoleVoice,
			"effectiveVoice": voice,
			"source":         voiceSource,
		})
	}
	if speechStyle != "" && !styleApplied {
		emitLog("speak.style.ignored", map[string]any{
			"model":  profile.Name,
			"reason": "model_does_not_support_instructions",
		})
	}
	emitLog("speak.config", map[string]any{
		"model":        profile.Name,
		"voice":        voice,
		"voiceSource":  voiceSource,
		"styleApplied": styleApplied,
	})
	session := map[string]any{
		"voice":           voice,
		"mode":            "commit",
		"response_format": "pcm",
		"sample_rate":     24000,
	}
	if styleApplied {
		// DashScope limits instructions to 1600 tokens. A conservative rune
		// limit keeps normal Chinese/English role descriptions within that
		// bound without cutting UTF-8 bytes in the middle of a character.
		session["instructions"] = truncateRunes(speechStyle, 1200)
	}
	if err := socket.send(map[string]any{
		"event_id": newID("event"),
		"type":     "session.update",
		"session":  session,
	}); err != nil {
		return err
	}
	if err := socket.send(map[string]any{"event_id": newID("event"), "type": "input_text_buffer.append", "text": text}); err != nil {
		return err
	}
	if err := socket.send(map[string]any{"event_id": newID("event"), "type": "input_text_buffer.commit"}); err != nil {
		return err
	}
	audioDone := false
	responseDone := false
	for {
		_, data, err := socket.conn.ReadMessage()
		if err != nil {
			return err
		}
		var event map[string]any
		if json.Unmarshal(data, &event) != nil {
			continue
		}
		typeName, _ := event["type"].(string)
		switch typeName {
		case "response.audio.delta":
			if delta, ok := event["delta"].(string); ok && delta != "" {
				emit(map[string]any{"type": "assistant.audio.delta", "data": delta})
			}
		case "response.audio.done":
			audioDone = true
			_ = socket.send(map[string]any{"event_id": newID("event"), "type": "session.finish"})
			if responseDone {
				return nil
			}
		case "response.done":
			emitRealtimeUsage("speak", profile.Name, event)
			responseDone = true
			if audioDone {
				return nil
			}
		case "error":
			return fmt.Errorf("TTS Realtime 返回错误：%s", errorMessage(event))
		case "session.finished":
			return nil
		}
	}
}

func (h *harness) executeDraw(action brainAction) {
	startedAt := time.Now()
	actionID := action.ActionID
	if actionID == "" {
		actionID = newID("draw")
	}
	resultChannel := make(chan actionResult, 1)
	h.actionMu.Lock()
	h.pendingActions[actionID] = resultChannel
	h.actionMu.Unlock()
	emit(map[string]any{
		"type":     "harness.draw.requested",
		"actionId": actionID,
		"action":   action,
	})
	emitLog("draw.requested", map[string]any{
		"actionId":  actionID,
		"operation": action.Operation,
	})
	timer := time.NewTimer(drawResultTimeout)
	defer timer.Stop()
	var result actionResult
	select {
	case result = <-resultChannel:
	case <-timer.C:
		result = actionResult{OK: false, Error: "draw_result_timeout"}
	}
	h.actionMu.Lock()
	delete(h.pendingActions, actionID)
	h.actionMu.Unlock()
	if !result.OK {
		emitLog("draw.failed", map[string]any{
			"actionId":   actionID,
			"operation":  action.Operation,
			"durationMs": durationMS(startedAt),
			"error":      result.Error,
		})
		h.logActionFailure("draw", actionID, "DRAW_FAILED", result.Error)
		return
	}
	emitLog("draw.completed", map[string]any{
		"actionId":    actionID,
		"operation":   action.Operation,
		"durationMs":  durationMS(startedAt),
		"resultBytes": len(result.Result),
	})
}

func (h *harness) receiveActionResult(actionID string, result actionResult) {
	if actionID == "" {
		emitLog("draw.result.ignored", map[string]any{"reason": "missing_action_id"})
		return
	}
	h.actionMu.Lock()
	channel := h.pendingActions[actionID]
	h.actionMu.Unlock()
	if channel == nil {
		emitLog("draw.result.ignored", map[string]any{
			"actionId": actionID,
			"reason":   "no_pending_action",
			"ok":       result.OK,
		})
		return
	}
	emitLog("draw.result.received", map[string]any{
		"actionId":    actionID,
		"ok":          result.OK,
		"resultBytes": len(result.Result),
		"error":       result.Error,
	})
	select {
	case channel <- result:
	default:
	}
}

func (h *harness) logActionFailure(actionType, actionID, code string, detail any) {
	payload := map[string]any{
		"type":       "harness.action.failed",
		"sessionId":  h.cfg.SessionID,
		"actionId":   actionID,
		"actionType": actionType,
		"error": map[string]any{
			"code":    code,
			"message": detail,
		},
		"retry": false,
	}
	appendDebugLog("harness.action.failed", map[string]any{
		"sessionId":  h.cfg.SessionID,
		"actionId":   actionID,
		"actionType": actionType,
		"code":       code,
		"detail":     detail,
		"retry":      false,
	})
	emit(payload)
}
