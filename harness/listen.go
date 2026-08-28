package main

import (
	"errors"
	"strings"
	"time"
)

func (h *harness) handleASREvent(event map[string]any) {
	eventType, _ := event["type"].(string)
	switch eventType {
	case "input_audio_buffer.speech_started":
		h.stateMu.Lock()
		h.speechStartedAt = time.Now()
		h.stateMu.Unlock()
		emitLog("listen.speech.started", map[string]any{
			"eventId": stringValue(event["event_id"], ""),
		})
		emit(map[string]any{"type": "speech.started"})
	case "input_audio_buffer.speech_stopped":
		emitLog("listen.speech.stopped", map[string]any{
			"eventId": stringValue(event["event_id"], ""),
		})
		emit(map[string]any{"type": "speech.stopped"})
	case "conversation.item.input_audio_transcription.completed":
		text, _ := event["transcript"].(string)
		text = strings.TrimSpace(text)
		if text == "" {
			emitLog("listen.completed.empty", map[string]any{
				"eventId": stringValue(event["event_id"], ""),
			})
			return
		}
		h.stateMu.Lock()
		speechStartedAt := h.speechStartedAt
		h.speechStartedAt = time.Time{}
		h.stateMu.Unlock()
		h.emitListenCompleted(text, stringValue(event["item_id"], ""), "asr", speechStartedAt)
	case "error":
		message := "ASR Realtime 返回错误"
		if raw, ok := event["error"].(map[string]any); ok {
			if value, ok := raw["message"].(string); ok && value != "" {
				message = value
			}
		}
		emitBridgeError(message)
		emitLog("listen.error", map[string]any{
			"eventId": stringValue(event["event_id"], ""),
			"error":   message,
		})
	}
}

func (h *harness) emitListenCompleted(text, utteranceID, inputSource string, speechStartedAt time.Time) {
	text = truncate(strings.TrimSpace(text), maxTextLength)
	if text == "" {
		emitLog("listen.completed.empty", map[string]any{"source": inputSource})
		return
	}
	if utteranceID == "" {
		utteranceID = newID("utt")
	}
	payload := listenPayload{
		UtteranceID: utteranceID,
		Text:        text,
		Language:    roleListeningLanguage(h.cfg.Role),
		IsFinal:     true,
		EndedAt:     nowString(),
	}
	s := signal{
		Schema: protocolSchema, Version: protocolVersion, Type: "listen.completed",
		EventID: newID("evt_listen"), SessionID: h.cfg.SessionID,
		CreatedAt: nowString(), Source: sourceFor("listen", h.cfg.Models["listen"]), Payload: payload,
	}
	listenFields := map[string]any{
		"eventId":         s.EventID,
		"utteranceId":     payload.UtteranceID,
		"transcriptBytes": len(payload.Text),
		"source":          inputSource,
	}
	if !speechStartedAt.IsZero() {
		listenFields["speechToFinalMs"] = durationMS(speechStartedAt)
	}
	emitLog("listen.completed", listenFields)
	emitSignal(s)
	emitDebugLog("conversation.content", map[string]any{
		"sessionId":   h.cfg.SessionID,
		"role":        "user",
		"source":      inputSource,
		"eventId":     s.EventID,
		"utteranceId": payload.UtteranceID,
		"text":        payload.Text,
	})
	emit(map[string]any{"type": "user.transcript", "text": payload.Text})
	h.appendHistory("user", payload.Text)
	go h.handleCompletedListen(s, payload, "")
}

func (h *harness) handleTextInput(text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		emitLog("listen.text.ignored", map[string]any{"reason": "empty"})
		return
	}
	if !h.cfg.ListeningEnabled {
		emitLog("listen.text.ignored", map[string]any{
			"reason":    "capability_disabled",
			"textBytes": len(text),
		})
		return
	}
	h.mu.Lock()
	active := h.cancel != nil && h.ctx != nil && h.asr != nil
	h.mu.Unlock()
	if !active {
		emitLog("listen.text.ignored", map[string]any{
			"reason":    "session_not_ready",
			"textBytes": len(text),
		})
		return
	}
	emitLog("listen.text.received", map[string]any{
		"textBytes": len(text),
	})
	h.emitListenCompleted(text, newID("utt_text"), "text", time.Time{})
}

func (h *harness) appendHistory(role, text string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.historyRevision++
	h.history = append(h.history, conversationMessage{
		Role:      role,
		Text:      truncate(text, maxTextLength),
		CreatedAt: nowString(),
		Revision:  h.historyRevision,
	})
	if len(h.history) > maxStoredMessages {
		h.history = h.history[len(h.history)-maxStoredMessages:]
	}
}

func importedHistory(value any) []conversationMessage {
	container, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	items, ok := container["messages"].([]any)
	if !ok {
		return nil
	}
	history := make([]conversationMessage, 0, len(items))
	for _, item := range items {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		text := truncate(stringValue(message["text"], ""), maxTextLength)
		if text == "" {
			continue
		}
		role := stringValue(message["speaker"], "user")
		if role == "You" {
			role = "user"
		} else {
			role = "assistant"
		}
		history = append(history, conversationMessage{
			Role: role, Text: text, CreatedAt: stringValue(message["timestamp"], ""),
		})
	}
	if len(history) > maxStoredMessages {
		history = history[len(history)-maxStoredMessages:]
	}
	return history
}

func (h *harness) appendAudio(data string) error {
	if !h.cfg.ListeningEnabled {
		return nil
	}
	h.mu.Lock()
	client := h.asr
	h.mu.Unlock()
	if client == nil {
		return errors.New("Harness ASR 尚未连接")
	}
	return client.appendAudio(data)
}

// runSeeMonitor keeps the visual context updated without putting See on the
// critical path of Brain. A frame change can request an earlier refresh; this
// ticker is the quiet-screen fallback that refreshes on the configured cadence.
