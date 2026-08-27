package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
	"time"
)

func testJPEGBase64(t *testing.T, fill color.Color, block color.Color) string {
	t.Helper()
	frame := image.NewRGBA(image.Rect(0, 0, 128, 72))
	for y := 0; y < frame.Bounds().Dy(); y++ {
		for x := 0; x < frame.Bounds().Dx(); x++ {
			frame.Set(x, y, fill)
		}
	}
	for y := 0; y < 36; y++ {
		for x := 0; x < 64; x++ {
			frame.Set(x, y, block)
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, frame, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("jpeg.Encode failed: %v", err)
	}
	return base64.StdEncoding.EncodeToString(encoded.Bytes())
}

func TestParseBrainActionRequiresSpeak(t *testing.T) {
	_, err := parseBrainAction(`{"actions":[{"type":"draw","operation":"circle"}]}`, "session", "listen", "see")
	if err == nil {
		t.Fatal("expected a draw-only action to be rejected")
	}
}

func TestParseVisionOutputNormalizesBoundingBoxes(t *testing.T) {
	output, err := parseVisionOutput(`{"summary":"button","objects":[{"objectId":"button-1","label":"button","bbox":{"x":-0.2,"y":0.8,"width":0.8,"height":0.5}}]}`)
	if err != nil {
		t.Fatalf("parseVisionOutput failed: %v", err)
	}
	box := output.Objects[0].BBox
	if box.X != 0 || box.Y != 0.8 || box.Width != 0.8 || box.Height < 0.199 || box.Height > 0.201 {
		t.Fatalf("unexpected normalized bbox: %+v", box)
	}
}

func TestParseVisionOutputAcceptsQwenOfficialGroundingArray(t *testing.T) {
	output, err := parseVisionOutput("```json\n[{\"bbox_2d\":[100,200,500,800],\"label\":\"按钮\",\"sub_label\":\"确认\"}]\n```")
	if err != nil {
		t.Fatalf("parseVisionOutput failed for Qwen bbox_2d: %v", err)
	}
	if len(output.Objects) != 1 {
		t.Fatalf("expected one object, got %d", len(output.Objects))
	}
	object := output.Objects[0]
	if object.ObjectID != "obj_1" || object.Label != "按钮" {
		t.Fatalf("unexpected object metadata: %+v", object)
	}
	if object.Attributes["subLabel"] != "确认" {
		t.Fatalf("expected sub_label to be preserved, got %+v", object.Attributes)
	}
	box := object.BBox
	if box.X != 0.1 || box.Y != 0.2 || box.Width != 0.4 || box.Height != 0.6 {
		t.Fatalf("unexpected Qwen bbox conversion: %+v", box)
	}
}

func TestParseVisionOutputAcceptsQwenBBoxInHarnessEnvelope(t *testing.T) {
	output, err := parseVisionOutput(`{"scene":"一个深色主题的模型配置页面","summary":"确认按钮","objects":[{"label":"按钮","bbox_2d":[780,80,900,130]}],"textBlocks":[{"text_content":"确认","bbox_2d":[780,80,900,130]}]}`)
	if err != nil {
		t.Fatalf("parseVisionOutput failed for Qwen envelope: %v", err)
	}
	if output.Scene != "一个深色主题的模型配置页面" {
		t.Fatalf("expected scene to be preserved, got %q", output.Scene)
	}
	if len(output.Objects) != 1 || len(output.TextBlocks) != 1 {
		t.Fatalf("unexpected parsed result: %+v", output)
	}
	if output.TextBlocks[0].Text != "确认" {
		t.Fatalf("expected text_content to map to text, got %+v", output.TextBlocks[0])
	}
	if output.Objects[0].BBox.Width != 0.12 || output.Objects[0].BBox.Height != 0.05 {
		t.Fatalf("unexpected envelope bbox conversion: %+v", output.Objects[0].BBox)
	}
}

func TestSeePromptRequiresSceneAndCompactVisionOutput(t *testing.T) {
	prompt := seeSystemPrompt() + seeUserPrompt()
	for _, required := range []string{"scene", "1 到 2 句", "最多返回 8 个", "objects 和 textBlocks 没有内容时必须返回空数组"} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("See prompt is missing %q", required)
		}
	}
}

func TestBrainPromptExplainsVisionProcessingState(t *testing.T) {
	prompt := buildRoleSystemPrompt(map[string]any{})
	for _, required := range []string{"latestVisionStatus", "recentVision", "processing", "not_shared", "正在理解画面，请稍等", "不能猜测画面内容", "initiativePrompt", "userInput.trigger"} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("Brain prompt is missing %q", required)
		}
	}
}

func TestStartConfigAcceptsInitiativeSetting(t *testing.T) {
	var config startConfig
	if err := json.Unmarshal([]byte(`{"initiativeEnabled":true}`), &config); err != nil {
		t.Fatalf("start config failed to decode: %v", err)
	}
	if !config.InitiativeEnabled {
		t.Fatal("expected initiativeEnabled to be forwarded to Harness")
	}
}

func TestImportedHistoryKeepsStorageCap(t *testing.T) {
	messages := make([]any, 0, maxStoredMessages+24)
	for index := 0; index < maxStoredMessages+24; index++ {
		messages = append(messages, map[string]any{
			"speaker":   "You",
			"text":      "message",
			"timestamp": "2026-08-27T10:00:00Z",
		})
	}
	history := importedHistory(map[string]any{"messages": messages})
	if len(history) != maxStoredMessages {
		t.Fatalf("expected %d imported messages, got %d", maxStoredMessages, len(history))
	}
}

func TestRecentHistoryUsesConfiguredConversationCount(t *testing.T) {
	h := newHarness()
	for index := 0; index < 5; index++ {
		h.history = append(h.history, conversationMessage{Role: "user", Text: string(rune('a' + index))})
	}

	recent := h.recentHistory(2)
	if len(recent) != 2 {
		t.Fatalf("expected two recent messages, got %d", len(recent))
	}
	if recent[0].Text != "d" || recent[1].Text != "e" {
		t.Fatalf("expected the newest two messages, got %+v", recent)
	}
}

func TestLatestVisionSnapshotsUsesConfiguredCount(t *testing.T) {
	h := newHarness()
	h.cfg.ScreenVisionEnabled = true
	h.cfg.RecentVisionCount = 2
	h.screenSharing = true
	for index, scene := range []string{"first", "second", "third"} {
		h.visionHistory = append(h.visionHistory, visionHistoryEntry{
			Payload:     &visionPayload{Scene: scene},
			EventID:     "see-" + scene,
			CompletedAt: time.Now().Add(time.Duration(index-3) * time.Second),
		})
	}

	visuals, eventIDs, status, _ := h.latestVisionSnapshots()
	if status != "available" {
		t.Fatalf("expected available vision context, got %q", status)
	}
	if len(visuals) != 2 || len(eventIDs) != 2 {
		t.Fatalf("expected two recent vision results, got %d visuals and %d event IDs", len(visuals), len(eventIDs))
	}
	if visuals[0].Scene != "second" || visuals[1].Scene != "third" {
		t.Fatalf("expected the newest two vision results, got %+v", visuals)
	}
}

func TestCompareFramePixelsIgnoresIdenticalSuccessfulBaseline(t *testing.T) {
	frame := testJPEGBase64(t, color.Black, color.White)
	stats, err := compareFramePixels(frame, frame)
	if err != nil {
		t.Fatalf("compareFramePixels failed: %v", err)
	}
	if significantFrameChange(stats, 8) {
		t.Fatalf("identical frames should not be considered changed: %+v", stats)
	}
}

func TestCompareFramePixelsDetectsSignificantScreenChange(t *testing.T) {
	baseline := testJPEGBase64(t, color.Black, color.Black)
	current := testJPEGBase64(t, color.Black, color.White)
	stats, err := compareFramePixels(baseline, current)
	if err != nil {
		t.Fatalf("compareFramePixels failed: %v", err)
	}
	if !significantFrameChange(stats, 8) {
		t.Fatalf("large frame change should be considered significant: %+v", stats)
	}
	if stats.ChangedRatio < seeChangeRatio {
		t.Fatalf("expected changed ratio >= %.2f, got %.4f", seeChangeRatio, stats.ChangedRatio)
	}
}

func TestSignificantFrameChangeUsesConfiguredThreshold(t *testing.T) {
	stats := frameDiffStats{ChangedRatio: 0.06, AverageLumaDiff: 1}
	if !significantFrameChange(stats, 5) {
		t.Fatal("a six percent change should pass a five percent threshold")
	}
	if significantFrameChange(stats, 8) {
		t.Fatal("a six percent change should not pass an eight percent threshold")
	}
}

func TestSeeRequestHonorsMinimumInterval(t *testing.T) {
	h := newHarness()
	h.cfg.SeeMinIntervalMS = 5000
	latest := &visionPayload{Scene: "unchanged context"}
	h.stateMu.Lock()
	h.latestSee = latest
	h.lastSeeDispatchAt = time.Now()
	h.stateMu.Unlock()

	future := h.requestSee("frame.changed")
	select {
	case <-future.done:
	case <-time.After(time.Second):
		t.Fatal("throttled See request did not resolve immediately")
	}
	if future.result != latest {
		t.Fatalf("throttled request should return the latest context")
	}
	h.stateMu.Lock()
	deferredRequest := h.seeInFlight
	h.stateMu.Unlock()
	if deferredRequest != nil {
		t.Fatal("throttled See request should not create an in-flight request")
	}
}

func TestLatestVisionSnapshotDistinguishesProcessingFromNotShared(t *testing.T) {
	h := newHarness()
	h.cfg.ScreenVisionEnabled = true
	h.stateMu.Lock()
	h.screenSharing = true
	h.seeAnalyzing = newSeeFuture()
	h.stateMu.Unlock()

	_, _, status, _ := h.latestVisionSnapshot()
	if status != "processing" {
		t.Fatalf("expected processing while See is analyzing the first frame, got %q", status)
	}

	h.stateMu.Lock()
	h.screenSharing = false
	h.stateMu.Unlock()
	_, _, status, _ = h.latestVisionSnapshot()
	if status != "not_shared" {
		t.Fatalf("expected not_shared when capture is stopped, got %q", status)
	}

	h.stateMu.Lock()
	h.screenSharing = true
	h.seeAnalyzing = nil
	h.stateMu.Unlock()
	_, _, status, _ = h.latestVisionSnapshot()
	if status != "waiting" {
		t.Fatalf("expected waiting before the first See result, got %q", status)
	}
}
