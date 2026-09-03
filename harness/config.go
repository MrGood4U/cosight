package main

import "time"

// Runtime constants and provider-specific defaults shared by the Harness modules.
const (
	protocolSchema                      = "cosight.harness.signal"
	protocolVersion                     = 1
	brainActionSchema                   = "cosight.harness.action"
	defaultSeeMinInterval               = 5 * time.Second
	seeMonitorTick                      = 1 * time.Second
	seeRequestGrace                     = 1500 * time.Millisecond
	drawResultTimeout                   = 5 * time.Second
	seePixelThreshold                   = 18.0
	seeChangeRatio                      = 0.08
	seeAverageDiff                      = 10.0
	seeSampleWidth                      = 64
	seeSampleHeight                     = 36
	maxStoredMessages                   = 100
	maxVisionHistory                    = 20
	defaultRecentMessages               = 20
	defaultRecentVisions                = 1
	defaultTurnDetectionSilenceDuration = 1600
	minTurnDetectionSilenceDuration     = 200
	maxTurnDetectionSilenceDuration     = 6000
	defaultSeeMaxObjects                = 8
	minSeeMaxObjects                    = 1
	maxSeeMaxObjects                    = 20
	conversationSummaryTriggerMessages  = 8
	maxConversationSummaryChars         = 800
	conversationSummaryMaxTokens        = 600
	maxTextLength                       = 12000
	knowledgeFastQueryMaxChars          = 6000
	knowledgeFastRecentMessages         = 6
	knowledgeFastWaitTimeout            = 1200 * time.Millisecond
	knowledgePlannerMaxTokens           = 700
	defaultTTSVoice                     = "Cherry"
	defaultBrainURL                     = "https://dashscope.aliyuncs.com/compatible-mode/v1"
	defaultSeeURL                       = "https://dashscope.aliyuncs.com/compatible-mode/v1"
	defaultListenURL                    = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
	defaultSpeakURL                     = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
)

func normalizeTurnDetectionSilenceDuration(value int) int {
	if value <= 0 {
		value = defaultTurnDetectionSilenceDuration
	}
	return clampInt(value, minTurnDetectionSilenceDuration, maxTurnDetectionSilenceDuration)
}

func normalizeSeeMaxObjects(value int) int {
	if value <= 0 {
		value = defaultSeeMaxObjects
	}
	return clampInt(value, minSeeMaxObjects, maxSeeMaxObjects)
}

// Qwen-TTS realtime voice IDs documented by DashScope. Role voices are
// shared with the legacy Omni mode, so Harness uses this list only to avoid
// sending a known Omni-only voice to a Qwen-TTS endpoint.
var qwenTTSRealtimeVoices = map[string]struct{}{
	"Cherry": {}, "Serena": {}, "Ethan": {}, "Chelsie": {}, "Momo": {},
	"Vivian": {}, "Moon": {}, "Maia": {}, "Kai": {}, "Nofish": {},
	"Bella": {}, "Jennifer": {}, "Ryan": {}, "Katerina": {}, "Aiden": {},
	"Eldric Sage": {}, "Mia": {}, "Mochi": {}, "Bellona": {}, "Vincent": {},
	"Bunny": {}, "Neil": {}, "Elias": {}, "Arthur": {}, "Nini": {},
	"Seren": {}, "Pip": {}, "Stella": {}, "Bodega": {}, "Sonrisa": {},
	"Alek": {}, "Dolce": {}, "Sohee": {}, "Ono Anna": {}, "Lenn": {},
	"Emilien": {}, "Andre": {}, "Radio Gol": {}, "Jada": {}, "Dylan": {},
	"Li": {}, "Marcus": {}, "Roy": {}, "Peter": {}, "Sunny": {}, "Eric": {},
	"Rocky": {}, "Kiki": {},
}
