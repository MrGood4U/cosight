package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"math"
	"strings"
	"time"
)

func (h *harness) runSeeMonitor(ctx context.Context) {
	ticker := time.NewTicker(seeMonitorTick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !h.cfg.ScreenVisionEnabled {
				continue
			}
			now := time.Now()
			h.stateMu.Lock()
			hasFrame := h.latestFrame != ""
			busy := h.seeInFlight != nil || h.seeAnalyzing != nil
			latestEventID := h.latestSeeEvent
			latestAgeMS := int64(-1)
			if h.latestSee != nil {
				latestAgeMS = durationMS(h.latestSeeCompleted)
			}
			lastDispatchAt := h.lastSeeDispatchAt
			h.stateMu.Unlock()

			intervalElapsed := lastDispatchAt.IsZero() || now.Sub(lastDispatchAt) >= time.Duration(h.cfg.SeeMinIntervalMS)*time.Millisecond
			if !hasFrame || busy || !intervalElapsed {
				continue
			}
			emitLog("see.refresh.due", map[string]any{
				"reason":      "see.interval",
				"seeEventId":  latestEventID,
				"latestAgeMs": latestAgeMS,
				"intervalMs":  h.cfg.SeeMinIntervalMS,
			})
			_ = h.requestSee("see.interval")
		}
	}
}

type frameDiffStats struct {
	AverageLumaDiff float64
	ChangedRatio    float64
	ReferenceWidth  int
	ReferenceHeight int
	CurrentWidth    int
	CurrentHeight   int
}

func decodeJPEGFrame(frameBase64 string) (image.Image, error) {
	encoded := strings.TrimSpace(frameBase64)
	if comma := strings.Index(encoded, ","); strings.HasPrefix(encoded, "data:") && comma >= 0 {
		encoded = encoded[comma+1:]
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("屏幕帧 Base64 解码失败：%w", err)
	}
	frame, err := jpeg.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("屏幕帧 JPEG 解码失败：%w", err)
	}
	return frame, nil
}

func imageLuma(frame image.Image, x, y int) float64 {
	r, g, b, _ := frame.At(x, y).RGBA()
	return (0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)) / 257
}

func compareFramePixels(referenceBase64, currentBase64 string) (frameDiffStats, error) {
	reference, err := decodeJPEGFrame(referenceBase64)
	if err != nil {
		return frameDiffStats{}, err
	}
	current, err := decodeJPEGFrame(currentBase64)
	if err != nil {
		return frameDiffStats{}, err
	}
	referenceBounds := reference.Bounds()
	currentBounds := current.Bounds()
	if referenceBounds.Dx() <= 0 || referenceBounds.Dy() <= 0 || currentBounds.Dx() <= 0 || currentBounds.Dy() <= 0 {
		return frameDiffStats{}, errors.New("屏幕帧尺寸无效")
	}
	changed := 0
	var totalDiff float64
	const sampleCount = seeSampleWidth * seeSampleHeight
	for row := 0; row < seeSampleHeight; row++ {
		for column := 0; column < seeSampleWidth; column++ {
			referenceX := referenceBounds.Min.X + column*(referenceBounds.Dx()-1)/(seeSampleWidth-1)
			referenceY := referenceBounds.Min.Y + row*(referenceBounds.Dy()-1)/(seeSampleHeight-1)
			currentX := currentBounds.Min.X + column*(currentBounds.Dx()-1)/(seeSampleWidth-1)
			currentY := currentBounds.Min.Y + row*(currentBounds.Dy()-1)/(seeSampleHeight-1)
			difference := imageLuma(reference, referenceX, referenceY) - imageLuma(current, currentX, currentY)
			if difference < 0 {
				difference = -difference
			}
			totalDiff += difference
			if difference >= seePixelThreshold {
				changed++
			}
		}
	}
	return frameDiffStats{
		AverageLumaDiff: totalDiff / sampleCount,
		ChangedRatio:    float64(changed) / sampleCount,
		ReferenceWidth:  referenceBounds.Dx(), ReferenceHeight: referenceBounds.Dy(),
		CurrentWidth: currentBounds.Dx(), CurrentHeight: currentBounds.Dy(),
	}, nil
}

func significantFrameChange(stats frameDiffStats, thresholdPercent float64) bool {
	thresholdRatio := clampFloat(thresholdPercent/100, 0.01, 1)
	return stats.ChangedRatio >= thresholdRatio
}

func roundFloat(value float64, places int) float64 {
	if places <= 0 {
		return math.Round(value)
	}
	factor := math.Pow10(places)
	return math.Round(value*factor) / factor
}

func (h *harness) compareCurrentFrameWithSeeBaseline(currentFrame string) {
	h.stateMu.Lock()
	now := time.Now()
	compareInterval := time.Duration(h.cfg.SeeMinIntervalMS) * time.Millisecond
	if !h.lastFrameCompareAt.IsZero() && now.Sub(h.lastFrameCompareAt) < compareInterval {
		h.stateMu.Unlock()
		return
	}
	referenceFrame := h.latestSeeFrame
	referenceEventID := h.latestSeeEvent
	seeBusy := h.seeInFlight != nil || h.seeAnalyzing != nil
	if referenceFrame != "" && !seeBusy {
		h.lastFrameCompareAt = now
	}
	h.stateMu.Unlock()
	if referenceFrame == "" || seeBusy {
		return
	}
	stats, err := compareFramePixels(referenceFrame, currentFrame)
	if err != nil {
		emitLog("see.frame.compare.failed", map[string]any{
			"referenceSeeEventId": referenceEventID,
			"currentFrameBytes":   len(currentFrame),
			"error":               err.Error(),
		})
		return
	}
	changed := significantFrameChange(stats, h.cfg.SeeChangeThreshold)
	h.stateMu.Lock()
	baselineStillCurrent := h.latestSeeEvent == referenceEventID && h.latestSeeFrame == referenceFrame
	h.stateMu.Unlock()
	emitLog("see.frame.compared", map[string]any{
		"referenceSeeEventId":    referenceEventID,
		"referenceFrameBytes":    len(referenceFrame),
		"currentFrameBytes":      len(currentFrame),
		"referenceWidth":         stats.ReferenceWidth,
		"referenceHeight":        stats.ReferenceHeight,
		"currentWidth":           stats.CurrentWidth,
		"currentHeight":          stats.CurrentHeight,
		"averageLumaDiff":        roundFloat(stats.AverageLumaDiff, 3),
		"changedRatio":           roundFloat(stats.ChangedRatio, 4),
		"changeThresholdPercent": roundFloat(h.cfg.SeeChangeThreshold, 2),
		"significant":            changed,
		"baselineStillCurrent":   baselineStillCurrent,
	})
	if changed && baselineStillCurrent {
		_ = h.requestSee("frame.changed")
	}
}

func (h *harness) receiveFrame(data, mode, requestID string) {
	if data == "" {
		emitLog("see.frame.empty", map[string]any{
			"mode":      mode,
			"requestId": requestID,
		})
		return
	}
	h.stateMu.Lock()
	h.latestFrame = data
	if mode == "see" && h.seeInFlight != nil {
		future := h.seeInFlight
		h.seeInFlight = nil
		h.seeAnalyzing = future
		h.stateMu.Unlock()
		emitLog("see.frame.received", map[string]any{
			"requestId":        requestID,
			"futureRequestId":  future.requestID,
			"frameBytes":       len(data),
			"waitMs":           durationMS(future.requestedAt),
			"requestIdMatched": requestID == "" || requestID == future.requestID,
		})
		go h.analyzeSee(future, data)
		return
	}
	if mode == "see" {
		futureRequestID := ""
		if h.seeAnalyzing != nil {
			futureRequestID = h.seeAnalyzing.requestID
		}
		h.stateMu.Unlock()
		emitLog("see.frame.unexpected", map[string]any{
			"requestId":       requestID,
			"activeRequestId": futureRequestID,
			"frameBytes":      len(data),
			"reason":          "no_capture_waiting",
		})
		return
	}
	h.stateMu.Unlock()
	if mode == "default" {
		if !h.cfg.ScreenVisionEnabled {
			return
		}
		go h.compareCurrentFrameWithSeeBaseline(data)
		// There is no image baseline until the first successful See. Start it
		// from the first usable ordinary frame; later frames are compared against
		// the last successful baseline instead of blindly calling the model.
		h.stateMu.Lock()
		needsInitialSee := h.latestSeeFrame == "" && h.seeInFlight == nil && h.seeAnalyzing == nil
		h.stateMu.Unlock()
		if needsInitialSee {
			_ = h.requestSee("initial_frame")
		}
	}
}

func (h *harness) requestSee(reason string) *seeFuture {
	return h.requestSeeWithOptions(reason)
}

func (h *harness) requestSeeWithOptions(reason string) *seeFuture {
	now := time.Now()
	h.stateMu.Lock()
	if h.seeInFlight != nil {
		future := h.seeInFlight
		h.stateMu.Unlock()
		emitLog("see.request.joined", map[string]any{
			"reason":       reason,
			"requestId":    future.requestID,
			"requestAgeMs": durationMS(future.requestedAt),
			"stage":        "capture_wait",
		})
		return future
	}
	if h.seeAnalyzing != nil {
		future := h.seeAnalyzing
		h.stateMu.Unlock()
		emitLog("see.request.joined", map[string]any{
			"reason":       reason,
			"requestId":    future.requestID,
			"requestAgeMs": durationMS(future.requestedAt),
			"stage":        "model_analysis",
		})
		return future
	}
	minInterval := time.Duration(h.cfg.SeeMinIntervalMS) * time.Millisecond
	if !h.lastSeeDispatchAt.IsZero() && now.Sub(h.lastSeeDispatchAt) < minInterval {
		remainingMS := (minInterval - now.Sub(h.lastSeeDispatchAt)).Milliseconds()
		latest := h.latestSee
		future := newSeeFuture()
		if latest != nil {
			future.resolve(latest, nil)
		} else {
			future.resolve(nil, errors.New("See 调用处于最小间隔限制内"))
		}
		h.stateMu.Unlock()
		emitLog("see.request.throttled", map[string]any{
			"reason":          reason,
			"remainingMs":     remainingMS,
			"minIntervalMs":   h.cfg.SeeMinIntervalMS,
			"hasLatestVision": latest != nil,
		})
		return future
	}
	future := newSeeFuture()
	requestID := newID("see_request")
	future.requestID = requestID
	future.reason = reason
	future.requestedAt = now
	h.seeInFlight = future
	h.seeRequestID = requestID
	h.lastSeeDispatchAt = now
	h.stateMu.Unlock()
	emitLog("see.request.created", map[string]any{
		"requestId": requestID,
		"reason":    reason,
	})
	emit(map[string]any{
		"type":      "harness.see.capture.requested",
		"requestId": requestID,
		"reason":    reason,
	})
	go func() {
		timer := time.NewTimer(seeRequestGrace)
		defer timer.Stop()
		<-timer.C
		h.stateMu.Lock()
		if h.seeInFlight != future {
			h.stateMu.Unlock()
			return
		}
		frame := h.latestFrame
		h.seeInFlight = nil
		if frame != "" {
			h.seeAnalyzing = future
		}
		h.stateMu.Unlock()
		if frame == "" {
			err := errors.New("没有收到可用于 See 的屏幕帧")
			emitLog("see.capture.failed", map[string]any{
				"requestId":  requestID,
				"reason":     "no_frame",
				"durationMs": durationMS(future.requestedAt),
				"graceMs":    seeRequestGrace.Milliseconds(),
			})
			future.resolve(nil, err)
			return
		}
		emitLog("see.frame.selected", map[string]any{
			"requestId":  requestID,
			"frameBytes": len(frame),
			"durationMs": durationMS(future.requestedAt),
			"reason":     "latest_frame_after_grace",
		})
		go h.analyzeSee(future, frame)
	}()
	return future
}

func (h *harness) analyzeSee(future *seeFuture, frameBase64 string) {
	if future == nil || frameBase64 == "" {
		return
	}
	defer func() {
		h.stateMu.Lock()
		if h.seeAnalyzing == future {
			h.seeAnalyzing = nil
		}
		h.stateMu.Unlock()
	}()
	startedAt := time.Now()
	profile := h.cfg.Models["see"]
	maxObjects := normalizeSeeMaxObjects(h.cfg.SeeMaxObjects)
	emitLog("see.model.started", map[string]any{
		"requestId":              future.requestID,
		"model":                  profile.Name,
		"frameBytes":             len(frameBase64),
		"reason":                 future.reason,
		"minIntervalMs":          h.cfg.SeeMinIntervalMS,
		"changeThresholdPercent": h.cfg.SeeChangeThreshold,
		"maxObjects":             maxObjects,
		"maxTokens":              nil,
	})
	// QwenCloud recommends omitting max_tokens for JSON output so the model
	// cannot truncate the response in the middle of a JSON document.
	content, err := h.callJSONModel(profile, "see", future.requestID, seeSystemPrompt(maxObjects), []any{
		map[string]any{"type": "text", "text": seeUserPrompt(maxObjects)},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/jpeg;base64," + frameBase64}},
	}, nil)
	seeDurationMS := durationMS(startedAt)
	if err != nil {
		emitLog("see.model.failed", map[string]any{
			"requestId":  future.requestID,
			"model":      profile.Name,
			"durationMs": seeDurationMS,
			"error":      err.Error(),
		})
		h.recordLatency("see", seeDurationMS)
		h.logActionFailure("see", "", "SEE_FAILED", err.Error())
		future.resolve(nil, err)
		return
	}
	emitLog("see.model.completed", map[string]any{
		"requestId":    future.requestID,
		"model":        profile.Name,
		"durationMs":   seeDurationMS,
		"contentBytes": len(content),
	})
	h.recordLatency("see", seeDurationMS)
	parseStartedAt := time.Now()
	modelOutput, err := parseVisionOutput(content)
	if err != nil {
		emitLog("see.parse.failed", map[string]any{
			"requestId":       future.requestID,
			"parseDurationMs": durationMS(parseStartedAt),
			"totalDurationMs": durationMS(startedAt),
			"contentBytes":    len(content),
			"contentPreview":  truncate(content, 4000),
			"error":           err.Error(),
		})
		h.logActionFailure("see", "", "SEE_INVALID_JSON", err.Error())
		future.resolve(nil, err)
		return
	}
	if len(modelOutput.Objects) > maxObjects {
		emitLog("see.parse.truncated", map[string]any{
			"requestId":   future.requestID,
			"objectCount": len(modelOutput.Objects),
			"maxObjects":  maxObjects,
		})
		modelOutput.Objects = modelOutput.Objects[:maxObjects]
	}
	emitLog("see.parse.completed", map[string]any{
		"requestId":          future.requestID,
		"parseDurationMs":    durationMS(parseStartedAt),
		"objectCount":        len(modelOutput.Objects),
		"textBlockCount":     len(modelOutput.TextBlocks),
		"sceneBytes":         len(modelOutput.Scene),
		"visionSummaryBytes": len(modelOutput.VisionSummary),
	})
	payload := &visionPayload{
		FrameID:         newID("frame"),
		CapturedAt:      nowString(),
		CoordinateSpace: "full_screen",
		Frame:           map[string]any{"format": "jpeg"},
		Scene:           truncate(modelOutput.Scene, maxTextLength),
		Objects:         modelOutput.Objects,
		TextBlocks:      modelOutput.TextBlocks,
		VisionSummary:   truncate(modelOutput.VisionSummary, maxTextLength),
	}
	s := signal{
		Schema: protocolSchema, Version: protocolVersion, Type: "see.completed",
		EventID: newID("evt_see"), SessionID: h.cfg.SessionID,
		CreatedAt: nowString(), Source: sourceFor("see", profile), Payload: payload,
	}
	h.stateMu.Lock()
	h.latestSee = payload
	h.latestSeeEvent = s.EventID
	// Keep the exact image that produced this successful payload. This is the
	// only frame allowed to become the local change-detection baseline.
	h.latestSeeFrame = frameBase64
	completedAt := time.Now()
	h.latestSeeCompleted = completedAt
	h.visionHistory = append(h.visionHistory, visionHistoryEntry{
		Payload:     payload,
		EventID:     s.EventID,
		CompletedAt: completedAt,
	})
	if len(h.visionHistory) > maxVisionHistory {
		h.visionHistory = h.visionHistory[len(h.visionHistory)-maxVisionHistory:]
	}
	h.stateMu.Unlock()
	emitSignal(s)
	future.resolve(payload, nil)
	emitLog("see.completed", map[string]any{
		"requestId":           future.requestID,
		"seeEventId":          s.EventID,
		"totalDurationMs":     durationMS(startedAt),
		"objectCount":         len(payload.Objects),
		"textBlockCount":      len(payload.TextBlocks),
		"hasScene":            strings.TrimSpace(payload.Scene) != "",
		"hasVisionSummary":    strings.TrimSpace(payload.VisionSummary) != "",
		"referenceFrameBytes": len(frameBase64),
	})
}

type visionModelOutput struct {
	Scene         string         `json:"scene"`
	Objects       []visionObject `json:"objects"`
	TextBlocks    []textBlock    `json:"textBlocks"`
	VisionSummary string         `json:"vision_summary"`
}

func parseVisionOutput(raw string) (visionModelOutput, error) {
	encoded := extractJSONValue(raw)
	if encoded == "" {
		return visionModelOutput{}, errors.New("See 响应不是 JSON")
	}
	var output visionModelOutput
	if strings.HasPrefix(encoded, "[") {
		// Official Qwen-VL grounding responses may be a JSON array of items.
		if err := json.Unmarshal([]byte(encoded), &output.Objects); err != nil {
			return output, err
		}
	} else {
		// Our envelope keeps vision_summary/textBlocks, while each item inside it can
		// use Qwen-VL's official bbox_2d field.
		var envelope struct {
			Objects       json.RawMessage `json:"objects"`
			TextBlocks    json.RawMessage `json:"textBlocks"`
			Scene         string          `json:"scene"`
			VisionSummary string          `json:"vision_summary"`
			LegacySummary string          `json:"summary"`
			BBox          json.RawMessage `json:"bbox"`
			BBox2D        []float64       `json:"bbox_2d"`
		}
		if err := json.Unmarshal([]byte(encoded), &envelope); err != nil {
			return output, err
		}
		output.Scene = envelope.Scene
		output.VisionSummary = envelope.VisionSummary
		if output.VisionSummary == "" {
			// Accept the pre-rename field from older See providers, but never
			// emit that ambiguous field in the Harness protocol.
			output.VisionSummary = envelope.LegacySummary
		}
		if len(envelope.Objects) > 0 && string(envelope.Objects) != "null" {
			if err := json.Unmarshal(envelope.Objects, &output.Objects); err != nil {
				return output, err
			}
		}
		if len(envelope.TextBlocks) > 0 && string(envelope.TextBlocks) != "null" {
			if err := json.Unmarshal(envelope.TextBlocks, &output.TextBlocks); err != nil {
				return output, err
			}
		}
		if len(output.Objects) == 0 && (len(envelope.BBox) > 0 || len(envelope.BBox2D) > 0) {
			var object visionObject
			if err := json.Unmarshal([]byte(encoded), &object); err != nil {
				return output, err
			}
			output.Objects = []visionObject{object}
		}
	}
	for index := range output.Objects {
		if output.Objects[index].ObjectID == "" {
			output.Objects[index].ObjectID = fmt.Sprintf("obj_%d", index+1)
		}
		output.Objects[index].BBox = normalizeBBox(output.Objects[index].BBox)
	}
	for index := range output.TextBlocks {
		output.TextBlocks[index].BBox = normalizeBBox(output.TextBlocks[index].BBox)
	}
	return output, nil
}

func parseBBoxValue(normalizedRaw json.RawMessage, qwenCoordinates []float64) (bbox, error) {
	if len(qwenCoordinates) > 0 {
		return qwenBBox(qwenCoordinates)
	}
	if len(normalizedRaw) == 0 || string(normalizedRaw) == "null" {
		return bbox{}, nil
	}
	trimmed := strings.TrimSpace(string(normalizedRaw))
	if strings.HasPrefix(trimmed, "[") {
		var coordinates []float64
		if err := json.Unmarshal(normalizedRaw, &coordinates); err != nil {
			return bbox{}, err
		}
		if len(coordinates) != 4 {
			return bbox{}, fmt.Errorf("bbox 数组必须包含 4 个坐标")
		}
		// A bbox array under the generic bbox key is accepted for compatibility
		// with integrations that already normalize coordinates to 0-1.
		if maxCoordinate(coordinates) <= 1 {
			return normalizeBBox(bbox{
				X: coordinates[0], Y: coordinates[1],
				Width: coordinates[2] - coordinates[0], Height: coordinates[3] - coordinates[1],
			}), nil
		}
		return qwenBBox(coordinates)
	}
	var normalized bbox
	if err := json.Unmarshal(normalizedRaw, &normalized); err != nil {
		return bbox{}, err
	}
	return normalizeBBox(normalized), nil
}

func qwenBBox(coordinates []float64) (bbox, error) {
	if len(coordinates) != 4 {
		return bbox{}, fmt.Errorf("bbox_2d 必须包含 4 个坐标")
	}
	x1, y1, x2, y2 := coordinates[0], coordinates[1], coordinates[2], coordinates[3]
	if x2 < x1 {
		x1, x2 = x2, x1
	}
	if y2 < y1 {
		y1, y2 = y2, y1
	}
	return normalizeBBox(bbox{
		X:      x1 / 1000,
		Y:      y1 / 1000,
		Width:  (x2 - x1) / 1000,
		Height: (y2 - y1) / 1000,
	}), nil
}

func maxCoordinate(values []float64) float64 {
	maximum := 0.0
	for _, value := range values {
		if value > maximum {
			maximum = value
		}
	}
	return maximum
}

func normalizeBBox(value bbox) bbox {
	value.X = clampFloat(value.X, 0, 1)
	value.Y = clampFloat(value.Y, 0, 1)
	value.Width = clampFloat(value.Width, 0, 1-value.X)
	value.Height = clampFloat(value.Height, 0, 1-value.Y)
	return value
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func (h *harness) latestVisionSnapshots() ([]*visionPayload, []string, string, int64) {
	if !h.cfg.ScreenVisionEnabled {
		return nil, nil, "disabled", -1
	}
	h.stateMu.Lock()
	seeBusy := h.seeInFlight != nil || h.seeAnalyzing != nil
	sharing := h.screenSharing
	history := append([]visionHistoryEntry(nil), h.visionHistory...)
	if len(history) == 0 && h.latestSee != nil {
		history = append(history, visionHistoryEntry{
			Payload:     h.latestSee,
			EventID:     h.latestSeeEvent,
			CompletedAt: h.latestSeeCompleted,
		})
	}
	h.stateMu.Unlock()
	if !sharing {
		return nil, nil, "not_shared", -1
	}
	if len(history) == 0 {
		if seeBusy {
			return nil, nil, "processing", -1
		}
		return nil, nil, "waiting", -1
	}
	limit := clampInt(h.cfg.RecentVisionCount, 1, maxVisionHistory)
	if limit > len(history) {
		limit = len(history)
	}
	selected := history[len(history)-limit:]
	visuals := make([]*visionPayload, 0, len(selected))
	eventIDs := make([]string, 0, len(selected))
	for _, item := range selected {
		if item.Payload == nil {
			continue
		}
		visuals = append(visuals, item.Payload)
		eventIDs = append(eventIDs, item.EventID)
	}
	if len(visuals) == 0 {
		return nil, nil, "waiting", -1
	}
	return visuals, eventIDs, "available", durationMS(selected[len(selected)-1].CompletedAt)
}

func (h *harness) latestVisionSnapshot() (*visionPayload, string, string, int64) {
	visuals, eventIDs, status, ageMS := h.latestVisionSnapshots()
	if len(visuals) == 0 {
		return nil, "", status, ageMS
	}
	eventID := eventIDs[len(eventIDs)-1]
	return visuals[len(visuals)-1], eventID, status, ageMS
}
