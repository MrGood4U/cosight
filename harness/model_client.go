package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"
)

type modelResponseDetails struct {
	ResponseID       string
	ResponseModel    string
	FinishReasons    []string
	Content          string
	ReasoningContent string
	ReasoningTokens  int64
}

func (h *harness) callJSONModel(profile modelProfile, stage, requestID, systemPrompt string, content any, maxTokens *int) (string, error) {
	h.mu.Lock()
	ctx := h.ctx
	sessionID := h.cfg.SessionID
	h.mu.Unlock()
	result, _, err := h.callJSONModelContextWithDetails(ctx, sessionID, profile, stage, requestID, systemPrompt, content, maxTokens)
	return result, err
}

func (h *harness) callJSONModelContext(ctx context.Context, sessionID string, profile modelProfile, stage, requestID, systemPrompt string, content any, maxTokens *int) (string, error) {
	result, _, err := h.callJSONModelContextWithDetails(ctx, sessionID, profile, stage, requestID, systemPrompt, content, maxTokens)
	return result, err
}

func (h *harness) callJSONModelContextWithDetails(ctx context.Context, sessionID string, profile modelProfile, stage, requestID, systemPrompt string, content any, maxTokens *int) (string, modelResponseDetails, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	endpoint, err := chatCompletionsURL(profile.URL, defaultBrainURL)
	if err != nil {
		emitLog(stage+".model.endpoint.failed", map[string]any{
			"requestId": requestID,
			"model":     profile.Name,
			"error":     err.Error(),
		})
		return "", modelResponseDetails{}, err
	}
	payload := map[string]any{
		"model": profile.Name,
		"messages": []any{
			map[string]any{"role": "system", "content": systemPrompt},
			map[string]any{"role": "user", "content": content},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.2,
	}
	if maxTokens != nil && *maxTokens > 0 {
		payload["max_tokens"] = *maxTokens
	}
	body, err := json.Marshal(payload)
	if err != nil {
		emitLog(stage+".model.request.serialize_failed", map[string]any{
			"requestId": requestID,
			"model":     profile.Name,
			"error":     err.Error(),
		})
		return "", modelResponseDetails{}, err
	}
	inputContentBytes := 0
	if encodedContent, contentErr := json.Marshal(content); contentErr == nil {
		inputContentBytes = len(encodedContent)
	}
	startedAt := time.Now()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		emitLog(stage+".model.request.failed", map[string]any{
			"requestId": requestID,
			"model":     profile.Name,
			"error":     err.Error(),
		})
		return "", modelResponseDetails{}, err
	}
	request.Header.Set("Authorization", "Bearer "+profile.APIKey)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		emitLog(stage+".model.transport.failed", map[string]any{
			"requestId":    requestID,
			"model":        profile.Name,
			"durationMs":   durationMS(startedAt),
			"requestBytes": len(body),
			"error":        err.Error(),
		})
		return "", modelResponseDetails{}, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024))
	if err != nil {
		emitLog(stage+".model.response.read_failed", map[string]any{
			"requestId":    requestID,
			"model":        profile.Name,
			"httpStatus":   response.StatusCode,
			"durationMs":   durationMS(startedAt),
			"requestBytes": len(body),
			"error":        err.Error(),
		})
		return "", modelResponseDetails{}, err
	}
	baseResponseLog := map[string]any{
		"requestId":         requestID,
		"model":             profile.Name,
		"httpStatus":        response.StatusCode,
		"durationMs":        durationMS(startedAt),
		"requestBytes":      len(body),
		"systemPromptBytes": len(systemPrompt),
		"inputContentBytes": inputContentBytes,
		"maxTokens":         maxTokensValue(maxTokens),
		"responseBytes":     len(responseBody),
		"contentType":       response.Header.Get("Content-Type"),
		"serverRequestId":   firstResponseHeader(response, "X-Request-ID", "X-Request-Id", "Request-Id"),
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		baseResponseLog["responsePreview"] = truncate(string(responseBody), 4000)
		emitLog(stage+".model.response.failed", baseResponseLog)
		return "", modelResponseDetails{}, fmt.Errorf("模型 HTTP %d：%s", response.StatusCode, truncate(string(responseBody), 2000))
	}
	var envelope struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Choices []struct {
			Index        int             `json:"index"`
			FinishReason json.RawMessage `json:"finish_reason"`
			Message      struct {
				Content          json.RawMessage `json:"content"`
				ReasoningContent json.RawMessage `json:"reasoning_content"`
				Reasoning        json.RawMessage `json:"reasoning"`
				Thinking         json.RawMessage `json:"thinking"`
				Refusal          json.RawMessage `json:"refusal"`
			} `json:"message"`
		} `json:"choices"`
		Usage json.RawMessage `json:"usage"`
		Error json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		baseResponseLog["responsePreview"] = truncate(string(responseBody), 4000)
		baseResponseLog["parseError"] = err.Error()
		emitLog(stage+".model.response.parse_failed", baseResponseLog)
		return "", modelResponseDetails{}, err
	}
	if len(envelope.Choices) == 0 {
		baseResponseLog["responsePreview"] = truncate(string(responseBody), 12000)
		baseResponseLog["providerErrorPresent"] = jsonRawPresent(envelope.Error)
		if jsonRawPresent(envelope.Error) {
			baseResponseLog["providerErrorPreview"] = truncate(string(envelope.Error), 2000)
		}
		emitLog(stage+".model.response.empty_choices", baseResponseLog)
		return "", modelResponseDetails{}, errors.New("模型响应缺少 choices")
	}

	choice := envelope.Choices[0]
	contentText := extractContentText(choice.Message.Content)
	reasoningRaw := choice.Message.ReasoningContent
	if !jsonRawPresent(reasoningRaw) {
		reasoningRaw = choice.Message.Reasoning
	}
	if !jsonRawPresent(reasoningRaw) {
		reasoningRaw = choice.Message.Thinking
	}
	reasoningContent := extractContentText(reasoningRaw)
	responseLog := map[string]any{}
	for key, value := range baseResponseLog {
		responseLog[key] = value
	}
	finishReasons := make([]string, 0, len(envelope.Choices))
	for _, item := range envelope.Choices {
		finishReasons = append(finishReasons, jsonRawText(item.FinishReason))
	}
	responseLog["responseId"] = envelope.ID
	responseLog["responseModel"] = envelope.Model
	responseLog["choiceCount"] = len(envelope.Choices)
	responseLog["finishReasons"] = finishReasons
	responseLog["contentKind"] = jsonRawKind(choice.Message.Content)
	responseLog["contentBytes"] = len(contentText)
	responseLog["reasoningPresent"] = strings.TrimSpace(reasoningContent) != ""
	responseLog["reasoningContentBytes"] = len(reasoningContent)
	responseLog["refusalBytes"] = jsonRawTextLength(choice.Message.Refusal)
	responseLog["providerErrorPresent"] = jsonRawPresent(envelope.Error)
	responseLog["usagePresent"] = jsonRawPresent(envelope.Usage)
	if jsonRawPresent(envelope.Error) {
		responseLog["providerErrorPreview"] = truncate(string(envelope.Error), 2000)
	}
	if jsonRawPresent(envelope.Usage) {
		responseLog["usagePreview"] = truncate(string(envelope.Usage), 1000)
		if usage := normalizeModelUsage(envelope.Usage); usage != nil {
			responseLog["usage"] = usage
			usageFields := map[string]any{
				"sessionId": sessionID,
				"requestId": requestID,
				"module":    stage,
				"model":     profile.Name,
			}
			for key, value := range usage {
				usageFields[key] = value
			}
			emitLog("model.usage", usageFields)
		}
	}
	reasoningTokens := int64(0)
	if jsonRawPresent(envelope.Usage) {
		var usage map[string]any
		if json.Unmarshal(envelope.Usage, &usage) == nil {
			reasoningTokens = reasoningTokenCount(usage)
		}
	}
	responseLog["reasoningTokens"] = reasoningTokens
	if strings.TrimSpace(contentText) == "" {
		responseLog["emptyContent"] = true
		responseLog["responsePreview"] = truncate(string(responseBody), 12000)
	}
	emitLog(stage+".model.response.received", responseLog)
	responseDetails := modelResponseDetails{
		ResponseID:       envelope.ID,
		ResponseModel:    envelope.Model,
		FinishReasons:    finishReasons,
		Content:          contentText,
		ReasoningContent: reasoningContent,
		ReasoningTokens:  reasoningTokens,
	}
	emitDebugLog(stage+".model.output", map[string]any{
		"sessionId":     sessionID,
		"requestId":     requestID,
		"module":        stage,
		"model":         profile.Name,
		"responseId":    envelope.ID,
		"finishReasons": finishReasons,
		"content":       truncateRunes(contentText, 12000),
	})
	if strings.TrimSpace(reasoningContent) != "" {
		emitDebugLog(stage+".model.reasoning", map[string]any{
			"sessionId":             sessionID,
			"requestId":             requestID,
			"module":                stage,
			"model":                 profile.Name,
			"responseId":            envelope.ID,
			"reasoningContent":      truncateRunes(reasoningContent, 20000),
			"reasoningContentBytes": len(reasoningContent),
			"reasoningTokens":       reasoningTokens,
		})
	}
	return contentText, responseDetails, nil
}

func emitRealtimeUsage(module, model string, event map[string]any) {
	if event == nil {
		return
	}
	var raw json.RawMessage
	if value, ok := event["usage"]; ok {
		raw, _ = json.Marshal(value)
	} else if response, ok := event["response"].(map[string]any); ok {
		if value, exists := response["usage"]; exists {
			raw, _ = json.Marshal(value)
		}
	}
	usage := normalizeModelUsage(raw)
	if usage == nil {
		return
	}
	fields := map[string]any{
		"module":  module,
		"model":   model,
		"eventId": stringValue(event["event_id"], ""),
	}
	for key, value := range usage {
		fields[key] = value
	}
	emitLog("model.usage", fields)
}

func normalizeModelUsage(raw json.RawMessage) map[string]any {
	if !jsonRawPresent(raw) {
		return nil
	}
	var usage map[string]any
	if err := json.Unmarshal(raw, &usage); err != nil {
		return nil
	}
	inputTokens := usageNumber(usage, "inputTokens", "input_tokens", "promptTokens", "prompt_tokens")
	outputTokens := usageNumber(usage, "outputTokens", "output_tokens", "completionTokens", "completion_tokens")
	totalTokens := usageNumber(usage, "totalTokens", "total_tokens")
	if totalTokens <= 0 {
		totalTokens = inputTokens + outputTokens
	}
	if inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0 {
		return nil
	}
	return map[string]any{
		"inputTokens":     inputTokens,
		"outputTokens":    outputTokens,
		"totalTokens":     totalTokens,
		"reasoningTokens": reasoningTokenCount(usage),
	}
}

func reasoningTokenCount(usage map[string]any) int64 {
	if usage == nil {
		return 0
	}
	if count := usageNumber(usage, "reasoningTokens", "reasoning_tokens", "thinkingTokens", "thinking_tokens"); count > 0 {
		return count
	}
	for _, key := range []string{"completion_tokens_details", "completionTokensDetails", "output_tokens_details", "outputTokensDetails"} {
		if details, ok := usage[key].(map[string]any); ok {
			if count := usageNumber(details, "reasoningTokens", "reasoning_tokens", "thinkingTokens", "thinking_tokens"); count > 0 {
				return count
			}
		}
	}
	return 0
}

func usageNumber(usage map[string]any, keys ...string) int64 {
	for _, key := range keys {
		value, ok := usage[key]
		if !ok {
			continue
		}
		switch number := value.(type) {
		case float64:
			if number >= 0 {
				return int64(math.Round(number))
			}
		case json.Number:
			if parsed, err := number.Int64(); err == nil && parsed >= 0 {
				return parsed
			}
		case int:
			if number >= 0 {
				return int64(number)
			}
		}
	}
	return 0
}

func jsonRawPresent(raw json.RawMessage) bool {
	return len(bytes.TrimSpace(raw)) > 0 && string(bytes.TrimSpace(raw)) != "null"
}

func jsonRawKind(raw json.RawMessage) string {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return "missing"
	}
	if bytes.Equal(trimmed, []byte("null")) {
		return "null"
	}
	switch trimmed[0] {
	case '"':
		return "string"
	case '[':
		return "array"
	case '{':
		return "object"
	default:
		return "scalar"
	}
}

func jsonRawTextLength(raw json.RawMessage) int {
	if !jsonRawPresent(raw) {
		return 0
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return len(text)
	}
	return len(bytes.TrimSpace(raw))
}

func jsonRawText(raw json.RawMessage) string {
	if !jsonRawPresent(raw) {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return truncate(text, 200)
	}
	return truncate(string(raw), 200)
}

func maxTokensValue(maxTokens *int) any {
	if maxTokens == nil {
		return nil
	}
	return *maxTokens
}

func firstResponseHeader(response *http.Response, names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(response.Header.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

func extractContentText(raw json.RawMessage) string {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}
	var parts []map[string]any
	if json.Unmarshal(raw, &parts) == nil {
		var builder strings.Builder
		for _, part := range parts {
			if value, ok := part["text"].(string); ok {
				builder.WriteString(value)
			}
		}
		return builder.String()
	}
	return string(raw)
}
