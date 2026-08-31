package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
)

func (h *harness) updateCapabilities(command inputCommand) {
	if command.ScreenSharing == nil {
		return
	}
	sharing := *command.ScreenSharing
	h.stateMu.Lock()
	changed := h.screenSharing != sharing
	h.screenSharing = sharing
	h.stateMu.Unlock()
	if changed {
		emitLog("screen.sharing.updated", map[string]any{
			"screenSharing": sharing,
		})
	}
}

func (h *harness) handleCommand(command inputCommand) {
	switch command.Type {
	case "audio":
		if err := h.appendAudio(command.Data); err != nil {
			emitLog("音频发送失败", map[string]any{"error": err.Error()})
		}
	case "text":
		h.handleTextInput(command.Data)
	case "context.clear":
		h.clearConversationContext()
	case "initiative":
		h.handleInitiative(command.Data)
	case "video", "video.flush", "frame":
		h.receiveFrame(command.Data, command.Mode, command.RequestID)
	case "capabilities.update":
		h.updateCapabilities(command)
	case "action.result":
		result := actionResult{OK: command.OK, Result: command.Result, Error: command.Error}
		h.receiveActionResult(command.ActionID, result)
	case "knowledge.context":
		emitLog("knowledge.context.command.received", map[string]any{
			"eventId":            command.KnowledgeEventID,
			"knowledgeRequestId": command.KnowledgeRequestID,
			"turnId":             command.KnowledgeTurnID,
			"brainRequestId":     command.KnowledgeBrainRequestID,
			"plannerRequestId":   command.KnowledgePlannerRequestID,
			"roleId":             command.KnowledgeRoleID,
			"status":             command.KnowledgeStatus,
			"matches":            len(command.KnowledgeMatches),
		})
		h.receiveKnowledgeContextWithMetadata(command.KnowledgeEventID, command.KnowledgeMatches, command.KnowledgeStatus, commandErrorText(command.Error), knowledgeRequestMetadata{
			TurnID:           command.KnowledgeTurnID,
			BrainRequestID:   command.KnowledgeBrainRequestID,
			PlannerRequestID: command.KnowledgePlannerRequestID,
			RoleID:           command.KnowledgeRoleID,
		})
	case "stop":
		h.stop()
	case "start":
		var config startConfig
		if len(command.Config) > 0 {
			if err := json.Unmarshal(command.Config, &config); err != nil {
				emitBridgeError(fmt.Sprintf("Harness start 配置无效：%v", err))
				return
			}
		} else {
			emitBridgeError("Harness start 缺少 config")
			return
		}
		if err := h.start(config); err != nil {
			emitLog("session.start.failed", map[string]any{"error": err.Error()})
			emitBridgeError(err.Error())
		}
	default:
		emitLog("command.ignored", map[string]any{"type": command.Type})
	}
}

func commandErrorText(value any) string {
	if value == nil {
		return ""
	}
	if message, ok := value.(string); ok {
		return message
	}
	if encoded, err := json.Marshal(value); err == nil {
		return string(encoded)
	}
	return fmt.Sprint(value)
}

func runHarnessProcess() {
	h := newHarness()
	appendInfoLog("harness.started", map[string]any{"version": protocolVersion})
	emit(map[string]any{"type": "harness.started", "version": protocolVersion})
	decoder := json.NewDecoder(os.Stdin)
	for {
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			if !errors.Is(err, io.EOF) {
				emitBridgeError(fmt.Sprintf("Harness 输入解析失败：%v", err))
			}
			h.stop()
			return
		}
		var command inputCommand
		if err := json.Unmarshal(raw, &command); err != nil {
			appendErrorLog("harness.command.invalid", map[string]any{"error": err.Error()})
			emitBridgeError(fmt.Sprintf("Harness 命令无效：%v", err))
			continue
		}
		h.handleCommand(command)
	}
}
