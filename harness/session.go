package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type harness struct {
	mu       sync.Mutex
	stateMu  sync.Mutex
	brainMu  sync.Mutex
	actionMu sync.Mutex
	latency  *latencyMetrics

	ctx    context.Context
	cancel context.CancelFunc
	cfg    startConfig
	asr    *asrClient

	sessionStartedAt time.Time
	speechStartedAt  time.Time

	history                   []conversationMessage
	conversationSummary       conversationSummary
	historyRevision           uint64
	summaryCoveredRevision    uint64
	summaryGeneration         uint64
	summaryInFlight           bool
	summaryInFlightGeneration uint64

	latestFrame    string
	seeInFlight    *seeFuture
	seeAnalyzing   *seeFuture
	latestSee      *visionPayload
	latestSeeEvent string
	// latestSeeFrame is deliberately updated only after See returns valid
	// structured data. It is the visual baseline for local change detection;
	// an in-flight or failed See result must never replace it.
	latestSeeFrame     string
	latestSeeCompleted time.Time
	lastSeeDispatchAt  time.Time
	lastFrameCompareAt time.Time
	seeRequestID       string
	screenSharing      bool
	visionHistory      []visionHistoryEntry

	pendingActions map[string]chan actionResult
}

func newHarness() *harness {
	return &harness{
		pendingActions: make(map[string]chan actionResult),
		latency:        newLatencyMetrics(),
	}
}

func (h *harness) start(config startConfig) error {
	h.stopInternal(false)
	if config.SessionID == "" {
		config.SessionID = newID("session")
	}
	if config.SeeMinIntervalMS <= 0 {
		config.SeeMinIntervalMS = int(defaultSeeMinInterval / time.Millisecond)
	}
	config.SeeMinIntervalMS = clampInt(config.SeeMinIntervalMS, 1000, 60000)
	if config.SeeChangeThreshold <= 0 {
		config.SeeChangeThreshold = seeChangeRatio * 100
	}
	config.SeeChangeThreshold = clampFloat(config.SeeChangeThreshold, 1, 100)
	if config.RecentConversationCount <= 0 {
		config.RecentConversationCount = defaultRecentMessages
	}
	config.RecentConversationCount = clampInt(config.RecentConversationCount, 1, maxStoredMessages)
	if config.RecentVisionCount <= 0 {
		config.RecentVisionCount = defaultRecentVisions
	}
	config.RecentVisionCount = clampInt(config.RecentVisionCount, 1, maxVisionHistory)
	if err := validateStartConfig(config); err != nil {
		return err
	}
	h.mu.Lock()
	h.cfg = config
	h.ctx, h.cancel = context.WithCancel(context.Background())
	h.sessionStartedAt = time.Now()
	h.history = importedHistory(config.ImportedContext)
	h.historyRevision = 0
	for index := range h.history {
		h.historyRevision++
		h.history[index].Revision = h.historyRevision
	}
	h.conversationSummary = normalizeConversationSummary(config.ConversationSummary)
	h.summaryCoveredRevision = h.historyRevision
	h.summaryGeneration++
	h.summaryInFlight = false
	h.summaryInFlightGeneration = h.summaryGeneration
	h.latestFrame = ""
	h.latestSee = nil
	h.latestSeeEvent = ""
	h.latestSeeFrame = ""
	h.latestSeeCompleted = time.Time{}
	h.lastSeeDispatchAt = time.Time{}
	h.lastFrameCompareAt = time.Time{}
	h.seeInFlight = nil
	h.seeAnalyzing = nil
	h.screenSharing = config.ScreenSharing
	h.visionHistory = nil
	h.mu.Unlock()
	h.resetLatencyMetrics(config.SessionID)

	modelNames := map[string]string{}
	for module, profile := range config.Models {
		modelNames[module] = profile.Name
	}
	emitLog("session.started", map[string]any{
		"sessionId":               config.SessionID,
		"screenVisionEnabled":     config.ScreenVisionEnabled,
		"screenSharing":           config.ScreenSharing,
		"listeningEnabled":        config.ListeningEnabled,
		"speakingEnabled":         config.SpeakingEnabled,
		"drawingEnabled":          config.DrawingEnabled,
		"initiativeEnabled":       config.InitiativeEnabled,
		"recentConversationCount": config.RecentConversationCount,
		"recentVisionCount":       config.RecentVisionCount,
		"seeMinIntervalMs":        config.SeeMinIntervalMS,
		"seeChangeThreshold":      config.SeeChangeThreshold,
		"seeMonitorTickMs":        seeMonitorTick.Milliseconds(),
		"seeCompare": map[string]any{
			"sampleWidth":                 seeSampleWidth,
			"sampleHeight":                seeSampleHeight,
			"pixelThreshold":              seePixelThreshold,
			"changeRatio":                 config.SeeChangeThreshold / 100,
			"defaultChangeRatio":          seeChangeRatio,
			"changeThresholdPercent":      config.SeeChangeThreshold,
			"averageLumaDiff":             seeAverageDiff,
			"averageLumaDiffIsDiagnostic": true,
		},
		"models": modelNames,
	})
	emit(map[string]any{"type": "connected", "mode": "harness"})
	if config.ScreenVisionEnabled {
		go h.runSeeMonitor(h.ctx)
	} else {
		emitLog("see.disabled", map[string]any{"reason": "capability_disabled"})
	}
	if config.ListeningEnabled {
		profile := config.Models["listen"]
		client, err := newASRClient(profile, roleListeningLanguage(config.Role), h.handleASREvent)
		if err != nil {
			h.stop()
			return fmt.Errorf("Harness ASR 启动失败：%w", err)
		}
		h.mu.Lock()
		h.asr = client
		h.mu.Unlock()
	} else {
		emitLog("listen.disabled", map[string]any{"reason": "capability_disabled"})
	}
	emitLog("session.ready", map[string]any{
		"sessionId": config.SessionID,
	})
	emit(map[string]any{"type": "bridge.ready", "mode": "harness", "sessionId": config.SessionID})
	h.maybeStartConversationSummary()
	return nil
}

func validateStartConfig(config startConfig) error {
	for _, module := range []string{"brain", "listen", "speak", "see"} {
		profile := config.Models[module]
		if strings.TrimSpace(profile.Name) == "" {
			return fmt.Errorf("请配置 %s 模型名称", module)
		}
		if strings.TrimSpace(profile.APIKey) == "" {
			return fmt.Errorf("请配置 %s 模型 API Key", module)
		}
		if strings.TrimSpace(profile.URL) == "" {
			return fmt.Errorf("请配置 %s 模型 URL", module)
		}
	}
	if _, err := chatCompletionsURL(config.Models["brain"].URL, defaultBrainURL); err != nil {
		return fmt.Errorf("Brain 配置无效：%w", err)
	}
	if _, err := chatCompletionsURL(config.Models["see"].URL, defaultSeeURL); err != nil {
		return fmt.Errorf("See 配置无效：%w", err)
	}
	return nil
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func (h *harness) stop() {
	h.stopInternal(true)
}

func (h *harness) stopInternal(announce bool) {
	h.mu.Lock()
	client := h.asr
	h.asr = nil
	cancel := h.cancel
	h.cancel = nil
	sessionID := h.cfg.SessionID
	sessionStartedAt := h.sessionStartedAt
	h.sessionStartedAt = time.Time{}
	// Invalidate any asynchronous summary request before cancelling the
	// session context. A provider may return after cancellation, so the
	// generation check in finishConversationSummary must reject that result.
	h.summaryGeneration++
	h.summaryInFlight = false
	h.summaryInFlightGeneration = h.summaryGeneration
	h.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if client != nil {
		client.closeSession()
	}
	h.actionMu.Lock()
	for actionID, channel := range h.pendingActions {
		select {
		case channel <- actionResult{OK: false, Error: "harness_stopped"}:
		default:
		}
		delete(h.pendingActions, actionID)
	}
	h.actionMu.Unlock()
	if sessionID != "" && !sessionStartedAt.IsZero() {
		emitLog("session.stopped", map[string]any{
			"sessionId":  sessionID,
			"durationMs": durationMS(sessionStartedAt),
			"cause":      map[bool]string{true: "requested", false: "restart_or_exit"}[announce],
		})
		h.emitLatencySummary("session.stopped")
	}
	if announce {
		emit(map[string]any{"type": "bridge.stopped", "mode": "harness"})
	}
}
