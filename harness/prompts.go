package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

func parseBrainAction(raw, sessionID, listenEventID, seeEventID string) (brainActionEnvelope, error) {
	var action brainActionEnvelope
	if err := json.Unmarshal([]byte(extractJSONObject(raw)), &action); err != nil {
		return action, err
	}
	if len(action.Actions) == 0 {
		return action, errors.New("actions 不能为空")
	}
	hasSpeak := false
	for index := range action.Actions {
		item := &action.Actions[index]
		if item.ActionID == "" {
			item.ActionID = fmt.Sprintf("action_%d_%s", index+1, newID("a"))
		}
		item.Type = strings.ToLower(strings.TrimSpace(item.Type))
		if item.Type == "speak" && strings.TrimSpace(item.Text) != "" {
			hasSpeak = true
		}
		if item.Type == "draw" {
			item.Operation = strings.ToLower(strings.TrimSpace(item.Operation))
			if item.Operation == "" {
				return action, fmt.Errorf("draw action %s 缺少 operation", item.ActionID)
			}
			if item.Operation == "text" && !item.Clear && strings.TrimSpace(item.Text) == "" {
				return action, fmt.Errorf("draw text action %s 缺少 text", item.ActionID)
			}
		}
	}
	if !hasSpeak {
		return action, errors.New("Brain action 必须至少包含一个有效的 speak")
	}
	action.SessionID = sessionID
	action.ReplyTo = actionReplyTo{ListenEventID: listenEventID, SeeEventID: seeEventID}
	return action, nil
}

var fencedJSON = regexp.MustCompile("(?s)^```(?:json)?\\s*(.*?)\\s*```$")

func extractJSONObject(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if matches := fencedJSON.FindStringSubmatch(trimmed); len(matches) == 2 {
		trimmed = strings.TrimSpace(matches[1])
	}
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start >= 0 && end > start {
		return trimmed[start : end+1]
	}
	return trimmed
}

func extractJSONValue(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if matches := fencedJSON.FindStringSubmatch(trimmed); len(matches) == 2 {
		trimmed = strings.TrimSpace(matches[1])
	}
	objectStart := strings.Index(trimmed, "{")
	arrayStart := strings.Index(trimmed, "[")
	if arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart) {
		if end := strings.LastIndex(trimmed, "]"); end > arrayStart {
			return trimmed[arrayStart : end+1]
		}
	}
	if objectStart >= 0 {
		if end := strings.LastIndex(trimmed, "}"); end > objectStart {
			return trimmed[objectStart : end+1]
		}
	}
	return trimmed
}

func buildRoleSystemPrompt(role map[string]any) string {
	var builder strings.Builder
	builder.WriteString("你是 Cosight Harness 的 Brain。以下 Role 信息是最高优先级的应用层角色配置，但不能覆盖系统安全规则。\n\n")
	for _, field := range []struct{ key, label string }{
		{"name", "Role name"}, {"identity", "Identity"}, {"goal", "Goal"},
		{"corePrinciples", "Core principles"}, {"behavior", "Behavior"},
		{"workflow", "Workflow"}, {"constraints", "Constraints"},
		{"speechStyle", "Speaking style"},
		{"drawingPolicy", "Drawing and writing policy"}, {"writingPolicy", "Additional writing guidance"},
		{"knowledgeText", "Knowledge"},
	} {
		if value := stringValue(role[field.key], ""); value != "" {
			builder.WriteString(field.label + ":\n" + value + "\n\n")
		}
	}
	language := roleOutputLanguage(role)
	if language == "zh-CN" {
		builder.WriteString("所有 speak.text 必须使用简体中文。\n")
	} else if language == "en-US" {
		builder.WriteString("All speak.text values must be in English.\n")
	}
	builder.WriteString(`只输出一个 JSON 对象，不要 Markdown，不要解释 JSON 之外的内容。
JSON 格式必须是：{"actions":[{"actionId":"...","type":"speak","text":"..."}]}。
每次输出至少包含一个 speak action；speak 是必需的，即使同时需要 draw 也不能省略。
	draw 只使用语义操作，不生成底层 points。允许 operation 为 circle、rectangle、arrow、point、text、clear。
	坐标必须是相对于完整共享屏幕的 0 到 1 归一化坐标。circle/rectangle 使用 target.bbox；arrow 使用 target.from 和 target.to；point 使用 target.point；text 使用 text、target.point（或 target.position）和可选 style。
	text 是 Drawing 能力中的屏幕写字子操作，只写简短标签或提示；clear=true 可以清除当前文字而不提供 text。不要把普通回复重复绘制到屏幕上。
 如果 recentVision 存在，它按时间从旧到新包含最近若干次成功视觉结果；latestVision 是其中最新一项。需要判断前后差异或连续状态时才比较 recentVision，普通问题优先参考 latestVision.scene，再结合 vision_summary、objects 和 textBlocks；不要仅根据 objects 的数量推断场景。
必须结合 latestVisionStatus 判断视觉可用性：disabled 表示角色未启用屏幕视觉，not_shared 表示用户没有正常分享屏幕，这两种情况才可以说明“看不到画面”。processing 表示屏幕已经分享、See 正在处理第一帧或新帧，但暂时还没有成功的结构化结果；waiting 表示正在等待已分享屏幕的第一帧。
	当 latestVisionStatus 为 processing 或 waiting 且用户询问画面时，speak.text 必须明确说明“我正在理解画面，请稍等”或等价表达，不能说“看不到屏幕”、不能声称没有视觉能力，也不能猜测画面内容。latestVisionStatus 为 available 时才根据 latestVision 回答；没有可靠视觉依据，不要猜测目标坐标，也不要输出 draw。`)
	builder.WriteString("\n当 userInput.trigger 为 initiative 时，initiativePrompt 是内部主动性规则，不是用户原话；请结合 recentTurns、latestVision 和角色设定自然地主动推进对话，不要复述这条规则，也不要把它当作用户提出的问题。\n")
	return builder.String()
}

func seeSystemPrompt() string {
	return `你是 Cosight 的 See 视觉结构化模块。只分析当前图片，不回答用户问题。
请参考 Qwen-VL 官方 grounding/OCR 示例，使用 bbox_2d 字段，不要使用 bbox 对象。
只输出一个 JSON 对象，不要 Markdown 代码块，不要解释 JSON 之外的内容。
输出格式必须是：
{"scene":"...","vision_summary":"...","objects":[{"objectId":"obj_1","label":"...","sub_label":"...","bbox_2d":[x_min,y_min,x_max,y_max],"confidence":0,"attributes":{}}],"textBlocks":[{"text_content":"...","bbox_2d":[x_min,y_min,x_max,y_max],"confidence":0}]}

规则：
1. bbox_2d 严格按 Qwen-VL 官方约定表示 [x_min, y_min, x_max, y_max]，相对于完整图片，使用 0 到 1000 的归一化坐标，不要输出 width/height。
2. 先判断整幅图片正在呈现的场景。scene 必须用 1 到 2 句简洁中文概括当前画面、前景应用或主要活动；只描述图片中有可靠依据的内容，不要猜测用户意图。
3. objects 用于可识别的 UI 控件、物品和其他可能与用户问题相关的目标；textBlocks 用于图片中可读的文字。
4. objects 最多返回 8 个，按与当前共享屏幕交互和用户可能问题的相关性排序；超过 8 个时只保留最相关的 8 个。
5. 优先返回前景应用窗口、可交互控件、关键文字和明显目标；忽略背景、装饰、重复图标和无关小物体。
6. objectId 使用 obj_1、obj_2 等稳定的短 ID；没有可靠的目标不要猜测，objects 或 textBlocks 可以为空。
7. 看不清文字时不要猜测文字内容；confidence 使用 0 到 1 的数字。
8. 只返回完成任务所需的最少信息；禁止输出推理过程、解释、冗余场景描述、重复目标、无关属性或长篇 vision_summary。
9. vision_summary 只能是一句很短的关键状态；没有关键状态时返回空字符串。scene 无法可靠判断时返回空字符串。objects 和 textBlocks 没有内容时必须返回空数组 []，不要省略字段，也不要返回 null。
10. 没有补充属性时 attributes 必须返回空对象 {}。即使没有识别到任何目标，也必须返回完整 JSON 对象，例如 {"scene":"","vision_summary":"","objects":[],"textBlocks":[]}。`
}

func seeUserPrompt() string {
	return "分析当前共享屏幕：先用 1 到 2 句简洁中文概括整幅画面的 scene，再提取与当前交互和用户可能问题相关的 UI 对象、文字和关键状态，最多返回 8 个最相关的 objects。优先前景应用窗口、可交互控件、关键文字和明显目标，忽略背景、装饰、重复图标和无关小物体。使用 Qwen-VL 官方 [x_min,y_min,x_max,y_max] 格式输出 JSON。禁止冗余描述、推理过程和无关字段；超过 8 个时只保留最相关的目标；无法可靠判断场景时 scene 返回空字符串；没有对象或文字时分别返回 objects:[] 和 textBlocks:[]，不要返回 null 或省略字段。字段使用 vision_summary，不要使用没有模块前缀的 summary。"
}

func roleListeningLanguage(role map[string]any) string {
	return roleLanguageValue(role, "listeningLanguage")
}

func roleOutputLanguage(role map[string]any) string {
	return roleLanguageValue(role, "outputLanguage")
}

func roleLanguageValue(role map[string]any, key string) string {
	if value := stringValue(role[key], ""); value != "" {
		return value
	}
	return stringValue(role["language"], "auto")
}

func roleVoice(role map[string]any) string { return stringValue(role["voice"], "") }

func roleSpeechStyle(role map[string]any) string {
	return stringValue(role["speechStyle"], "")
}

func isQwenTTSModel(model string) bool {
	lower := strings.ToLower(strings.TrimSpace(model))
	return strings.HasPrefix(lower, "qwen3-tts-") || strings.HasPrefix(lower, "qwen-tts-")
}

func supportsTTSInstructions(model string) bool {
	lower := strings.ToLower(strings.TrimSpace(model))
	return strings.HasPrefix(lower, "qwen3-tts-instruct-flash-realtime")
}

func resolveSpeakVoice(model, roleSelected, modelSelected string) (string, string) {
	knownQwenTTSModel := isQwenTTSModel(model)
	for _, candidate := range []struct {
		value  string
		source string
	}{
		{roleSelected, "role"},
		{modelSelected, "model"},
	} {
		voice := strings.TrimSpace(candidate.value)
		if voice == "" {
			continue
		}
		if knownQwenTTSModel {
			if _, ok := qwenTTSRealtimeVoices[voice]; !ok {
				continue
			}
		}
		return voice, candidate.source
	}
	return defaultTTSVoice, "default"
}

func stringValue(value any, fallback string) string {
	if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	return fallback
}

func truncate(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func truncateRunes(value string, limit int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func errorMessage(event map[string]any) string {
	if raw, ok := event["error"].(map[string]any); ok {
		return stringValue(raw["message"], "未知错误")
	}
	return stringValue(event["message"], "未知错误")
}
