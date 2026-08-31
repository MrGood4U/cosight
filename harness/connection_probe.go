package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type modelConnectionTestInput struct {
	Module string
	Name   string
	URL    string
	Voice  string
}

func runModelConnectionTest() {
	var input modelConnectionTestInput
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		writeModelConnectionTestResult(fmt.Errorf("invalid model configuration: %w", err))
		return
	}
	input.Module = strings.ToLower(strings.TrimSpace(input.Module))
	input.Name = strings.TrimSpace(input.Name)
	input.URL = strings.TrimSpace(input.URL)
	input.Voice = strings.TrimSpace(input.Voice)
	if input.Name == "" || input.URL == "" {
		writeModelConnectionTestResult(fmt.Errorf("model name and URL are required"))
		return
	}
	apiKey := strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY"))
	if apiKey == "" {
		writeModelConnectionTestResult(fmt.Errorf("API key is required"))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	err := testModelConnection(ctx, modelProfile{
		Name:   input.Name,
		URL:    input.URL,
		APIKey: apiKey,
		Voice:  input.Voice,
	}, input.Module)
	writeModelConnectionTestResult(err)
}

func writeModelConnectionTestResult(err error) {
	result := map[string]any{"ok": err == nil}
	if err != nil {
		result["error"] = err.Error()
	}
	_ = json.NewEncoder(os.Stdout).Encode(result)
}

func testModelConnection(ctx context.Context, profile modelProfile, module string) error {
	switch module {
	case "brain":
		return testHTTPModelConnection(ctx, profile, defaultBrainURL)
	case "see":
		return testHTTPModelConnection(ctx, profile, defaultSeeURL)
	case "listen":
		return testRealtimeModelConnection(ctx, profile, defaultListenURL, map[string]any{
			"modalities":                []string{"text"},
			"input_audio_format":        "pcm",
			"sample_rate":               16000,
			"input_audio_transcription": map[string]any{},
			"turn_detection": map[string]any{
				"type":                "server_vad",
				"threshold":           0.2,
				"silence_duration_ms": 400,
			},
		})
	case "speak":
		voice, _ := resolveSpeakVoice(profile.Name, "", profile.Voice)
		return testRealtimeModelConnection(ctx, profile, defaultSpeakURL, map[string]any{
			"voice":           voice,
			"mode":            "commit",
			"response_format": "pcm",
			"sample_rate":     24000,
		})
	default:
		return fmt.Errorf("unsupported Harness module %q", module)
	}
}

func testHTTPModelConnection(ctx context.Context, profile modelProfile, fallback string) error {
	endpoint, err := chatCompletionsURL(profile.URL, fallback)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]any{
		"model": profile.Name,
		"messages": []any{
			map[string]string{"role": "user", "content": "ping"},
		},
		"max_tokens": 8,
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+profile.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("model HTTP %d: %s", response.StatusCode, truncate(string(body), 2000))
	}
	var envelope struct {
		Choices []json.RawMessage
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return fmt.Errorf("invalid model response: %w", err)
	}
	if len(envelope.Choices) == 0 {
		return fmt.Errorf("model response contains no choices")
	}
	return nil
}

func testRealtimeModelConnection(ctx context.Context, profile modelProfile, fallback string, session map[string]any) error {
	socket, err := dialRealtimeContext(ctx, profile, fallback)
	if err != nil {
		return err
	}
	defer socket.close()
	if err := socket.send(map[string]any{
		"event_id": newID("event"),
		"type":     "session.update",
		"session":  session,
	}); err != nil {
		return err
	}
	_ = socket.conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	for {
		_, data, err := socket.conn.ReadMessage()
		if err != nil {
			return err
		}
		var event map[string]any
		if err := json.Unmarshal(data, &event); err != nil {
			continue
		}
		switch eventType := stringValue(event["type"], ""); eventType {
		case "session.updated":
			return nil
		case "error":
			if detail, ok := event["error"]; ok {
				return fmt.Errorf("Realtime model error: %s", truncate(commandErrorText(detail), 2000))
			}
			return fmt.Errorf("Realtime model returned an error")
		}
	}
}
