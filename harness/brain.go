package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var errStaleTurn = errors.New("stale_turn")

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

type actionExecutionConfig struct {
	sessionID       string
	speakingEnabled bool
	drawingEnabled  bool
	speakProfile    modelProfile
	role            map[string]any
}

func (h *harness) currentActionConfig() actionExecutionConfig {
	h.mu.Lock()
	defer h.mu.Unlock()
	return actionExecutionConfig{
		sessionID:       h.cfg.SessionID,
		speakingEnabled: h.cfg.SpeakingEnabled,
		drawingEnabled:  h.cfg.DrawingEnabled,
		speakProfile:    h.cfg.Models["speak"],
		role:            cloneStringMap(h.cfg.Role),
	}
}

func (h *harness) executeAction(action brainAction) {
	_ = h.executeActionWithConfig(nil, h.currentActionConfig(), action)
}

func (h *harness) executeTurnAction(turn turnRequest, action brainAction) bool {
	if !h.isTurnCurrent(turn) {
		return false
	}
	return h.executeActionWithConfig(&turn, actionExecutionConfig{
		sessionID:       turn.sessionID,
		speakingEnabled: turn.speakingEnabled,
		drawingEnabled:  turn.drawingEnabled,
		speakProfile:    turn.speakProfile,
		role:            turn.role,
	}, action)
}

func (h *harness) executeActionWithConfig(turn *turnRequest, config actionExecutionConfig, action brainAction) bool {
	current := func() bool {
		return turn == nil || h.isTurnCurrent(*turn)
	}
	logFailure := func(actionType, actionID, code string, detail any) bool {
		if !current() {
			return false
		}
		if turn != nil {
			return h.logActionFailureForTurn(*turn, actionType, actionID, code, detail)
		}
		h.logActionFailure(actionType, actionID, code, detail)
		return true
	}

	switch action.Type {
	case "speak":
		text := strings.TrimSpace(action.Text)
		if text == "" {
			if !current() {
				return false
			}
			emitLog("speak.failed", map[string]any{
				"actionId": action.ActionID,
				"code":     "SPEAK_TEXT_EMPTY",
			})
			return logFailure("speak", action.ActionID, "SPEAK_TEXT_EMPTY", "speak.text 不能为空")
		}
		if !current() {
			return false
		}
		emitDebugLog("conversation.content", map[string]any{
			"sessionId": config.sessionID,
			"role":      "assistant",
			"source":    "brain.speak",
			"actionId":  action.ActionID,
			"text":      text,
		})
		if !config.speakingEnabled {
			if !current() {
				return false
			}
			emitLog("speak.skipped", map[string]any{
				"actionId":  action.ActionID,
				"textBytes": len(text),
				"reason":    "capability_disabled",
			})
			// Keep text output and conversation history available when voice
			// output is disabled, but never open a TTS connection.
			emit(map[string]any{"type": "assistant.text.delta", "text": text})
			if !h.appendHistoryForTurnIfCurrent(turn, "assistant", text) {
				return false
			}
			h.maybeStartConversationSummary()
			if !current() {
				return false
			}
			emit(map[string]any{"type": "assistant.text.done", "text": text})
			return true
		}
		speakStartedAt := time.Now()
		if !current() {
			return false
		}
		emitLog("speak.started", map[string]any{
			"actionId":  action.ActionID,
			"textBytes": len(text),
			"model":     config.speakProfile.Name,
		})
		emit(map[string]any{"type": "assistant.text.delta", "text": text})
		generation := uint64(0)
		if turn != nil {
			generation = turn.generation
		}
		speakContext := context.Background()
		if turn != nil && turn.ctx != nil {
			speakContext = turn.ctx
		}
		if err := h.speakWithConfig(text, config.speakProfile, config.role, current, generation, speakContext); err != nil {
			if !current() {
				return false
			}
			speakDurationMS := durationMS(speakStartedAt)
			emitLog("speak.failed", map[string]any{
				"actionId":   action.ActionID,
				"durationMs": speakDurationMS,
				"error":      err.Error(),
			})
			h.recordLatency("speak", speakDurationMS)
			return logFailure("speak", action.ActionID, "SPEAK_FAILED", err.Error())
		}
		if !current() {
			return false
		}
		speakDurationMS := durationMS(speakStartedAt)
		emitLog("speak.completed", map[string]any{
			"actionId":   action.ActionID,
			"durationMs": speakDurationMS,
			"textBytes":  len(text),
		})
		h.recordLatency("speak", speakDurationMS)
		if !h.appendHistoryForTurnIfCurrent(turn, "assistant", text) {
			return false
		}
		h.maybeStartConversationSummary()
		if !current() {
			return false
		}
		emit(map[string]any{"type": "assistant.text.done", "text": text})
		return true
	case "draw":
		if !config.drawingEnabled {
			if !current() {
				return false
			}
			emitLog("draw.failed", map[string]any{
				"actionId": action.ActionID,
				"code":     "DRAW_DISABLED",
			})
			return logFailure("draw", action.ActionID, "DRAW_DISABLED", "当前角色或捕获来源未启用绘画")
		}
		if turn != nil {
			drawAction := action
			if drawAction.ActionID == "" {
				drawAction.ActionID = newID("draw")
			}
			drawContext := context.Background()
			if turn.ctx != nil {
				drawContext = turn.ctx
			}
			return h.executeDrawWithGuard(drawAction, current, func(code string, detail any) bool {
				return h.logActionFailureForTurn(*turn, "draw", drawAction.ActionID, code, detail)
			}, drawContext)
		}
		h.executeDraw(action)
		return true
	default:
		return logFailure(action.Type, action.ActionID, "ACTION_UNSUPPORTED", "不支持的 Brain action 类型")
	}
}

func (h *harness) speak(text string) error {
	config := h.currentActionConfig()
	return h.speakWithConfig(text, config.speakProfile, config.role, nil, 0, context.Background())
}

func (h *harness) speakWithConfig(text string, profile modelProfile, role map[string]any, current func() bool, generation uint64, ctx context.Context) error {
	isCurrent := func() bool {
		return current == nil || current()
	}
	if !isCurrent() {
		return errStaleTurn
	}
	socket, err := dialRealtimeContext(ctx, profile, defaultSpeakURL)
	if err != nil {
		return err
	}
	if !h.registerTTSSocket(socket, generation, current) {
		socket.close()
		return errStaleTurn
	}
	defer h.unregisterTTSSocket(socket)
	defer socket.close()
	if !isCurrent() {
		return errStaleTurn
	}
	configuredRoleVoice := roleVoice(role)
	voice, voiceSource := resolveSpeakVoice(profile.Name, configuredRoleVoice, profile.Voice)
	speechStyle := roleSpeechStyle(role)
	styleApplied := speechStyle != "" && supportsTTSInstructions(profile.Name)
	if configuredRoleVoice != "" && voiceSource != "role" {
		if !isCurrent() {
			return errStaleTurn
		}
		emitLog("speak.voice.fallback", map[string]any{
			"model":          profile.Name,
			"requestedVoice": configuredRoleVoice,
			"effectiveVoice": voice,
			"source":         voiceSource,
		})
	}
	if speechStyle != "" && !styleApplied {
		if !isCurrent() {
			return errStaleTurn
		}
		emitLog("speak.style.ignored", map[string]any{
			"model":  profile.Name,
			"reason": "model_does_not_support_instructions",
		})
	}
	if !isCurrent() {
		return errStaleTurn
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
	if !isCurrent() {
		return errStaleTurn
	}
	if err := socket.send(map[string]any{
		"event_id": newID("event"),
		"type":     "session.update",
		"session":  session,
	}); err != nil {
		return err
	}
	if !isCurrent() {
		return errStaleTurn
	}
	if err := socket.send(map[string]any{"event_id": newID("event"), "type": "input_text_buffer.append", "text": text}); err != nil {
		return err
	}
	if !isCurrent() {
		return errStaleTurn
	}
	if err := socket.send(map[string]any{"event_id": newID("event"), "type": "input_text_buffer.commit"}); err != nil {
		return err
	}
	audioDone := false
	responseDone := false
	for {
		if !isCurrent() {
			return errStaleTurn
		}
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
				if !isCurrent() {
					return errStaleTurn
				}
				emit(map[string]any{"type": "assistant.audio.delta", "data": delta})
			}
		case "response.audio.done":
			audioDone = true
			if !isCurrent() {
				return errStaleTurn
			}
			_ = socket.send(map[string]any{"event_id": newID("event"), "type": "session.finish"})
			if responseDone {
				return nil
			}
		case "response.done":
			if !isCurrent() {
				return errStaleTurn
			}
			emitRealtimeUsage("speak", profile.Name, event)
			responseDone = true
			if audioDone {
				return nil
			}
		case "error":
			return fmt.Errorf("TTS Realtime 返回错误：%s", errorMessage(event))
		case "session.finished":
			if !isCurrent() {
				return errStaleTurn
			}
			return nil
		}
	}
}

func (h *harness) executeDraw(action brainAction) {
	_ = h.executeDrawWithGuard(action, nil, nil, context.Background())
}

func (h *harness) executeDrawWithGuard(action brainAction, current func() bool, logFailure func(code string, detail any) bool, ctx context.Context) bool {
	if current != nil && !current() {
		return false
	}
	if ctx == nil {
		ctx = context.Background()
	}
	startedAt := time.Now()
	actionID := action.ActionID
	if actionID == "" {
		actionID = newID("draw")
	}
	resultChannel := make(chan actionResult, 1)
	h.actionMu.Lock()
	h.pendingActions[actionID] = resultChannel
	h.actionMu.Unlock()
	if current != nil && !current() {
		h.actionMu.Lock()
		delete(h.pendingActions, actionID)
		h.actionMu.Unlock()
		return false
	}
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
	case <-ctx.Done():
		result = actionResult{OK: false, Error: "draw_cancelled"}
	}
	h.actionMu.Lock()
	delete(h.pendingActions, actionID)
	h.actionMu.Unlock()
	if ctx.Err() != nil || (current != nil && !current()) {
		return false
	}
	if !result.OK {
		emitLog("draw.failed", map[string]any{
			"actionId":   actionID,
			"operation":  action.Operation,
			"durationMs": durationMS(startedAt),
			"error":      result.Error,
		})
		if logFailure != nil {
			return logFailure("DRAW_FAILED", result.Error)
		}
		h.logActionFailure("draw", actionID, "DRAW_FAILED", result.Error)
		return true
	}
	emitLog("draw.completed", map[string]any{
		"actionId":    actionID,
		"operation":   action.Operation,
		"durationMs":  durationMS(startedAt),
		"resultBytes": len(result.Result),
	})
	return true
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
	h.mu.Lock()
	sessionID := h.cfg.SessionID
	h.mu.Unlock()
	h.logActionFailureWithSession(sessionID, actionType, actionID, code, detail)
}

func (h *harness) logActionFailureForTurn(turn turnRequest, actionType, actionID, code string, detail any) bool {
	if !h.isTurnCurrent(turn) {
		return false
	}
	h.logActionFailureWithSession(turn.sessionID, actionType, actionID, code, detail)
	return true
}

func (h *harness) logActionFailureWithSession(sessionID, actionType, actionID, code string, detail any) {
	payload := map[string]any{
		"type":       "harness.action.failed",
		"sessionId":  sessionID,
		"actionId":   actionID,
		"actionType": actionType,
		"error": map[string]any{
			"code":    code,
			"message": detail,
		},
		"retry": false,
	}
	appendErrorLog("harness.action.failed", map[string]any{
		"sessionId":  sessionID,
		"actionId":   actionID,
		"actionType": actionType,
		"code":       code,
		"detail":     detail,
		"retry":      false,
	})
	emit(payload)
}
