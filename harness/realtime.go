package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

func normalizeURL(raw string, fallback string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func realtimeURL(raw string, model string, fallback string) (string, error) {
	raw = normalizeURL(raw, fallback)
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("无效的 Realtime URL")
	}
	if u.Scheme != "ws" && u.Scheme != "wss" {
		return "", fmt.Errorf("Realtime URL 必须使用 ws 或 wss")
	}
	query := u.Query()
	if query.Get("model") == "" && model != "" {
		query.Set("model", model)
		u.RawQuery = query.Encode()
	}
	return u.String(), nil
}

func chatCompletionsURL(raw string, fallback string) (string, error) {
	raw = normalizeURL(raw, fallback)
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("无效的 HTTP 模型 URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("Brain/See URL 必须使用 http 或 https")
	}
	path := strings.TrimRight(u.Path, "/")
	if strings.HasSuffix(path, "/chat/completions") {
		u.Path = path
		return u.String(), nil
	}
	if strings.HasSuffix(path, "/v1") {
		u.Path = path + "/chat/completions"
		return u.String(), nil
	}
	if strings.Contains(path, "/compatible-mode") {
		u.Path = path + "/v1/chat/completions"
		return u.String(), nil
	}
	u.Path = path + "/v1/chat/completions"
	return u.String(), nil
}

func bearerHeaders(apiKey string) http.Header {
	headers := make(http.Header)
	headers.Set("Authorization", "Bearer "+apiKey)
	headers.Set("Content-Type", "application/json")
	headers.Set("OpenAI-Beta", "realtime=v1")
	return headers
}

type realtimeSocket struct {
	conn      *websocket.Conn
	write     sync.Mutex
	closeOnce sync.Once
}

func dialRealtime(profile modelProfile, fallback string) (*realtimeSocket, error) {
	return dialRealtimeContext(context.Background(), profile, fallback)
}

func dialRealtimeContext(ctx context.Context, profile modelProfile, fallback string) (*realtimeSocket, error) {
	if strings.TrimSpace(profile.APIKey) == "" {
		return nil, fmt.Errorf("模型 %q 缺少 API Key", profile.Name)
	}
	endpoint, err := realtimeURL(profile.URL, profile.Name, fallback)
	if err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	dialer := *websocket.DefaultDialer
	dialWatchers := make([]chan struct{}, 0, 1)
	dialer.NetDialContext = func(connectCtx context.Context, network, address string) (net.Conn, error) {
		connection, err := (&net.Dialer{}).DialContext(connectCtx, network, address)
		if err != nil {
			return nil, err
		}
		done := make(chan struct{})
		dialWatchers = append(dialWatchers, done)
		go func() {
			select {
			case <-dialCtx.Done():
				_ = connection.Close()
			case <-done:
			}
		}()
		return connection, nil
	}
	defer func() {
		for _, done := range dialWatchers {
			close(done)
		}
	}()
	conn, _, err := dialer.DialContext(dialCtx, endpoint, bearerHeaders(profile.APIKey))
	if err != nil {
		return nil, err
	}
	return &realtimeSocket{conn: conn}, nil
}

func (s *realtimeSocket) send(payload any) error {
	s.write.Lock()
	defer s.write.Unlock()
	return s.conn.WriteJSON(payload)
}

func (s *realtimeSocket) close() {
	if s == nil || s.conn == nil {
		return
	}
	s.closeOnce.Do(func() {
		_ = s.conn.Close()
	})
}

type asrClient struct {
	socket     *realtimeSocket
	ready      chan error
	onEvent    func(*asrClient, map[string]any)
	stopOnce   sync.Once
	model      string
	sessionID  string
	generation uint64
}

func newASRClient(ctx context.Context, profile modelProfile, language string, generation uint64, sessionID string, onEvent func(*asrClient, map[string]any)) (*asrClient, error) {
	startedAt := time.Now()
	emitLog("listen.connect.started", map[string]any{
		"model":    profile.Name,
		"language": language,
	})
	if ctx == nil {
		ctx = context.Background()
	}
	socket, err := dialRealtimeContext(ctx, profile, defaultListenURL)
	if err != nil {
		emitLog("listen.connect.failed", map[string]any{
			"model":      profile.Name,
			"durationMs": durationMS(startedAt),
			"error":      err.Error(),
		})
		return nil, err
	}
	client := &asrClient{
		socket:     socket,
		ready:      make(chan error, 1),
		onEvent:    onEvent,
		model:      profile.Name,
		sessionID:  sessionID,
		generation: generation,
	}
	go client.readLoop()
	transcription := map[string]any{}
	if language != "" && language != "auto" {
		transcription["language"] = languageCode(language)
	}
	update := map[string]any{
		"event_id": newID("event"),
		"type":     "session.update",
		"session": map[string]any{
			"modalities":                []string{"text"},
			"input_audio_format":        "pcm",
			"sample_rate":               16000,
			"input_audio_transcription": transcription,
			"turn_detection": map[string]any{
				"type":                "server_vad",
				"threshold":           0.2,
				"silence_duration_ms": 400,
			},
		},
	}
	if err := client.socket.send(update); err != nil {
		client.closeSession()
		emitLog("listen.connect.failed", map[string]any{
			"model":      profile.Name,
			"durationMs": durationMS(startedAt),
			"stage":      "session.update",
			"error":      err.Error(),
		})
		return nil, err
	}
	select {
	case err := <-client.ready:
		if err != nil {
			client.closeSession()
			emitLog("listen.connect.failed", map[string]any{
				"model":      profile.Name,
				"durationMs": durationMS(startedAt),
				"stage":      "session.updated",
				"error":      err.Error(),
			})
			return nil, err
		}
		emitLog("listen.connect.completed", map[string]any{
			"model":      profile.Name,
			"durationMs": durationMS(startedAt),
		})
		return client, nil
	case <-time.After(15 * time.Second):
		client.closeSession()
		err := fmt.Errorf("ASR session.updated 等待超时")
		emitLog("listen.connect.failed", map[string]any{
			"model":      profile.Name,
			"durationMs": durationMS(startedAt),
			"stage":      "session.updated",
			"error":      err.Error(),
		})
		return nil, err
	case <-ctx.Done():
		client.closeSession()
		err := ctx.Err()
		emitLog("listen.connect.failed", map[string]any{
			"model":      profile.Name,
			"durationMs": durationMS(startedAt),
			"stage":      "session.updated",
			"error":      err.Error(),
		})
		return nil, err
	}
}

func languageCode(language string) string {
	switch language {
	case "zh-CN":
		return "zh"
	case "en-US":
		return "en"
	default:
		return language
	}
}

func (c *asrClient) readLoop() {
	defer c.socket.close()
	for {
		_, data, err := c.socket.conn.ReadMessage()
		if err != nil {
			emitLog("listen.socket.closed", map[string]any{
				"model": c.model,
				"error": err.Error(),
			})
			select {
			case c.ready <- err:
			default:
			}
			return
		}
		var event map[string]any
		if err := json.Unmarshal(data, &event); err != nil {
			emitLog("listen.event.invalid", map[string]any{
				"model": c.model,
				"bytes": len(data),
				"error": err.Error(),
			})
			continue
		}
		if event["type"] == "session.updated" {
			select {
			case c.ready <- nil:
			default:
			}
		}
		if eventType, _ := event["type"].(string); eventType == "response.done" {
			emitRealtimeUsage("listen", c.model, event)
		}
		if c.onEvent != nil {
			c.onEvent(c, event)
		}
	}
}

func (c *asrClient) appendAudio(data string) error {
	if data == "" {
		return nil
	}
	return c.socket.send(map[string]any{
		"event_id": newID("event"),
		"type":     "input_audio_buffer.append",
		"audio":    data,
	})
}

func (c *asrClient) closeSession() {
	c.stopOnce.Do(func() {
		// Closing the transport must not wait for an in-flight WriteJSON or
		// acquire the socket write mutex. A session.finish notification is only
		// best effort; stop/clear must be able to release blocked ASR resources.
		c.socket.close()
	})
}

func (h *harness) registerTTSSocket(socket *realtimeSocket, generation uint64, current func() bool) bool {
	if socket == nil {
		return false
	}
	h.ttsMu.Lock()
	defer h.ttsMu.Unlock()
	if current != nil && !current() {
		return false
	}
	if h.ttsSockets == nil {
		h.ttsSockets = make(map[*realtimeSocket]uint64)
	}
	h.ttsSockets[socket] = generation
	return true
}

func (h *harness) unregisterTTSSocket(socket *realtimeSocket) {
	if socket == nil {
		return
	}
	h.ttsMu.Lock()
	delete(h.ttsSockets, socket)
	h.ttsMu.Unlock()
}

func (h *harness) closeTTSSocketsThrough(generation uint64) {
	h.ttsMu.Lock()
	var sockets []*realtimeSocket
	for socket, socketGeneration := range h.ttsSockets {
		if socketGeneration <= generation {
			delete(h.ttsSockets, socket)
			sockets = append(sockets, socket)
		}
	}
	h.ttsMu.Unlock()
	for _, socket := range sockets {
		socket.close()
	}
}
