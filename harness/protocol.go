package main

import (
	"encoding/json"
	"sync"
	"time"
)

type modelProfile struct {
	ID     string `json:"id"`
	Alias  string `json:"alias"`
	Name   string `json:"name"`
	URL    string `json:"url"`
	APIKey string `json:"apiKey"`
	Voice  string `json:"voice,omitempty"`
}

type startConfig struct {
	SessionID               string                  `json:"sessionId"`
	Models                  map[string]modelProfile `json:"models"`
	Role                    map[string]any          `json:"role"`
	SeeMinIntervalMS        int                     `json:"seeMinIntervalMs"`
	SeeChangeThreshold      float64                 `json:"seeChangeThreshold"`
	ScreenVisionEnabled     bool                    `json:"screenVisionEnabled"`
	ScreenSharing           bool                    `json:"screenSharing"`
	RecentConversationCount int                     `json:"recentConversationCount"`
	RecentVisionCount       int                     `json:"recentVisionCount"`
	ConversationSummary     conversationSummary     `json:"conversationSummary"`
	InitiativeEnabled       bool                    `json:"initiativeEnabled"`
	ListeningEnabled        bool                    `json:"listeningEnabled"`
	SpeakingEnabled         bool                    `json:"speakingEnabled"`
	DrawingEnabled          bool                    `json:"drawingEnabled"`
	ImportedContext         any                     `json:"importedContext,omitempty"`
}

type inputCommand struct {
	Type          string          `json:"type"`
	Data          string          `json:"data"`
	Mode          string          `json:"mode"`
	RequestID     string          `json:"requestId"`
	SessionID     string          `json:"sessionId"`
	ActionID      string          `json:"actionId"`
	OK            bool            `json:"ok"`
	Result        json.RawMessage `json:"result"`
	Error         any             `json:"error"`
	Config        json.RawMessage `json:"config"`
	ScreenSharing *bool           `json:"screenSharing"`
}

type signal struct {
	Schema    string `json:"schema"`
	Version   int    `json:"version"`
	Type      string `json:"type"`
	EventID   string `json:"eventId"`
	SessionID string `json:"sessionId"`
	CreatedAt string `json:"createdAt"`
	Source    any    `json:"source"`
	Payload   any    `json:"payload"`
}

type bbox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type visionObject struct {
	ObjectID   string         `json:"objectId"`
	Label      string         `json:"label"`
	BBox       bbox           `json:"bbox"`
	Confidence float64        `json:"confidence,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

// UnmarshalJSON accepts both the Harness-native bbox object and Qwen-VL's
// official grounding format: bbox_2d: [x_min, y_min, x_max, y_max]. Qwen-VL
// coordinates are normalized to a 0-1000 grid; the Harness converts them to
// the 0-1 x/y/width/height contract before emitting see.completed.
func (value *visionObject) UnmarshalJSON(data []byte) error {
	var raw struct {
		ObjectID   string          `json:"objectId"`
		Label      string          `json:"label"`
		SubLabel   string          `json:"sub_label"`
		BBox       json.RawMessage `json:"bbox"`
		BBox2D     []float64       `json:"bbox_2d"`
		Confidence float64         `json:"confidence,omitempty"`
		Attributes map[string]any  `json:"attributes,omitempty"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	box, err := parseBBoxValue(raw.BBox, raw.BBox2D)
	if err != nil {
		return err
	}
	value.ObjectID = raw.ObjectID
	value.Label = raw.Label
	value.BBox = box
	value.Confidence = raw.Confidence
	value.Attributes = raw.Attributes
	if raw.SubLabel != "" {
		if value.Attributes == nil {
			value.Attributes = map[string]any{}
		}
		value.Attributes["subLabel"] = raw.SubLabel
	}
	return nil
}

type textBlock struct {
	Text       string  `json:"text"`
	BBox       bbox    `json:"bbox"`
	Confidence float64 `json:"confidence,omitempty"`
}

// Qwen-VL OCR examples use text_content and bbox_2d. Keep the downstream
// textBlocks contract stable while accepting that official representation.
func (value *textBlock) UnmarshalJSON(data []byte) error {
	var raw struct {
		TextContent string          `json:"text_content"`
		Text        string          `json:"text"`
		BBox        json.RawMessage `json:"bbox"`
		BBox2D      []float64       `json:"bbox_2d"`
		Confidence  float64         `json:"confidence,omitempty"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	box, err := parseBBoxValue(raw.BBox, raw.BBox2D)
	if err != nil {
		return err
	}
	value.Text = raw.Text
	if value.Text == "" {
		value.Text = raw.TextContent
	}
	value.BBox = box
	value.Confidence = raw.Confidence
	return nil
}

type visionPayload struct {
	FrameID         string         `json:"frameId"`
	CapturedAt      string         `json:"capturedAt"`
	CoordinateSpace string         `json:"coordinateSpace"`
	Frame           map[string]any `json:"frame"`
	Scene           string         `json:"scene"`
	Objects         []visionObject `json:"objects"`
	TextBlocks      []textBlock    `json:"textBlocks"`
	VisionSummary   string         `json:"vision_summary"`
}

type listenPayload struct {
	UtteranceID string `json:"utteranceId"`
	Text        string `json:"text"`
	Language    string `json:"language,omitempty"`
	IsFinal     bool   `json:"isFinal"`
	StartedAt   string `json:"startedAt,omitempty"`
	EndedAt     string `json:"endedAt,omitempty"`
	DurationMS  int64  `json:"durationMs,omitempty"`
}

type actionReplyTo struct {
	ListenEventID string `json:"listenEventId"`
	SeeEventID    string `json:"seeEventId,omitempty"`
}

type brainAction struct {
	ActionID  string         `json:"actionId"`
	Type      string         `json:"type"`
	Text      string         `json:"text,omitempty"`
	Operation string         `json:"operation,omitempty"`
	Target    map[string]any `json:"target,omitempty"`
	Style     map[string]any `json:"style,omitempty"`
	Clear     bool           `json:"clear,omitempty"`
}

type brainActionEnvelope struct {
	Schema    string        `json:"schema,omitempty"`
	Version   int           `json:"version,omitempty"`
	Type      string        `json:"type,omitempty"`
	EventID   string        `json:"eventId,omitempty"`
	SessionID string        `json:"sessionId,omitempty"`
	CreatedAt string        `json:"createdAt,omitempty"`
	ReplyTo   actionReplyTo `json:"replyTo,omitempty"`
	Actions   []brainAction `json:"actions"`
}

type conversationMessage struct {
	Role      string `json:"role"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
	Revision  uint64 `json:"-"`
}

type conversationSummary struct {
	Topic        string   `json:"topic"`
	Facts        []string `json:"facts"`
	Decisions    []string `json:"decisions"`
	PendingTasks []string `json:"pendingTasks"`
	LastIntent   string   `json:"lastIntent"`
	UpdatedAt    string   `json:"updatedAt,omitempty"`
}

type seeFuture struct {
	done        chan struct{}
	once        sync.Once
	result      *visionPayload
	err         error
	requestID   string
	reason      string
	requestedAt time.Time
}

type visionHistoryEntry struct {
	Payload     *visionPayload
	EventID     string
	CompletedAt time.Time
}

func newSeeFuture() *seeFuture { return &seeFuture{done: make(chan struct{})} }

func (f *seeFuture) resolve(result *visionPayload, err error) {
	f.once.Do(func() {
		f.result = result
		f.err = err
		close(f.done)
	})
}

type actionResult struct {
	OK     bool
	Result json.RawMessage
	Error  any
}
