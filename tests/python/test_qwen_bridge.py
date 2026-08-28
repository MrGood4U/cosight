import json
import sys
import unittest
from types import SimpleNamespace

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import python.qwen_bridge as bridge_module


class FakeConversation:
    def __init__(self):
        self.responses = []
        self.updates = []

    def create_response(self, **kwargs):
        self.responses.append(kwargs)

    def update_session(self, **kwargs):
        self.updates.append(kwargs)


class QwenBridgeUnitTests(unittest.TestCase):
    def test_log_levels_distinguish_runtime_details_and_errors(self):
        self.assertEqual(bridge_module._log_level("session.ready"), "INFO")
        self.assertEqual(bridge_module._log_level("brain.model.failed"), "ERROR")
        self.assertEqual(bridge_module._log_level("bridge.emit"), "INFO")
        self.assertEqual(bridge_module._log_level("qwen.event"), "INFO")
        self.assertEqual(bridge_module._log_level("conversation.content"), "DEBUG")

    def test_role_languages_and_asr_transcription_are_independent(self):
        role = {"listeningLanguage": "zh-CN", "outputLanguage": "en-US"}
        self.assertEqual(bridge_module.role_listening_language(role), "zh-CN")
        self.assertEqual(bridge_module.role_output_language(role), "en-US")
        self.assertEqual(
            bridge_module.build_input_audio_transcription(role),
            {"model": "qwen3-asr-flash-realtime", "language": "zh"},
        )
        self.assertIn("English", bridge_module.build_role_language_lock(role))

    def test_role_instructions_respect_enabled_capabilities(self):
        role = {
            "name": "Test role",
            "drawingPolicy": "圈出目标",
            "writingPolicy": "写一个短标签",
            "initiativePrompt": "提出一个下一步问题",
            "speechStyle": "简短、自然",
            "initiativeTimeoutSec": 15,
        }
        enabled = bridge_module.build_role_instructions(role, True, True, True)
        disabled = bridge_module.build_role_instructions(role, False, False, False)
        self.assertIn("Drawing policy", enabled)
        self.assertIn("Writing policy", enabled)
        self.assertIn("Initiative trigger rule", enabled)
        self.assertIn("Speech style", enabled)
        self.assertNotIn("Drawing policy", disabled)
        self.assertNotIn("Writing policy", disabled)
        self.assertNotIn("Initiative trigger rule", disabled)

    def test_imported_context_and_summary_strip_media(self):
        context = {
            "messages": [{"text": "hello", "image": "base64-data"}],
            "capabilityCalls": [{"type": "see.completed", "payload": {"image": "drop", "bbox": {"x": 0.1}}}],
        }
        instructions = bridge_module.build_imported_context_instructions(context)
        self.assertIn("hello", instructions)
        self.assertIn("bbox", instructions)
        self.assertNotIn("base64-data", instructions)
        self.assertNotIn('"image"', instructions)

        summary = bridge_module.build_conversation_summary_instructions({"topic": "topic", "image": "drop"})
        self.assertIn("topic", summary)
        self.assertNotIn("drop", summary)

    def test_session_instructions_include_role_capabilities_and_summary(self):
        instructions = bridge_module.build_session_instructions(
            canvas_enabled=True,
            writing_enabled=False,
            screen_vision_enabled=True,
            listening_enabled=True,
            speaking_enabled=False,
            initiative_enabled=True,
            role={"outputLanguage": "zh-CN", "initiativeTimeoutSec": 12},
            imported_context={"messages": [{"text": "old"}]},
            conversation_summary={"topic": "current topic"},
        )
        self.assertIn("current topic", instructions)
        self.assertIn("Simplified Chinese", instructions)
        self.assertIn("透明", instructions)
        self.assertIn("屏幕视觉", instructions)
        self.assertIn("没有启用语音输出", instructions)

    def test_tool_argument_parser_accepts_fenced_json_and_reports_malformed_input(self):
        self.assertEqual(
            bridge_module.parse_tool_arguments("```json\n{\"x\": 1}\n```"),
            {"x": 1},
        )
        parsed = bridge_module.parse_tool_arguments('{"x": 1} trailing text')
        self.assertEqual(parsed["x"], 1)
        self.assertIn("__trailingData", parsed)
        invalid = bridge_module.parse_tool_arguments("not json")
        self.assertIn("__parseError", invalid)

    def test_voice_resolution_uses_model_supported_fallback(self):
        self.assertEqual(bridge_module.default_voice_for_model("qwen3.5-omni-flash-realtime"), "Tina")
        self.assertEqual(bridge_module.resolve_voice_for_model("qwen3-omni-flash-realtime", "Cherry"), "Cherry")
        self.assertEqual(bridge_module.resolve_voice_for_model("qwen3-omni-flash-realtime", "NotARealVoice"), "Cherry")
        self.assertEqual(bridge_module.resolve_voice_for_model("custom-model", "CustomVoice"), "CustomVoice")

    def test_response_queue_serializes_requests_and_clears_cancelled_responses(self):
        original_multi_modality = bridge_module.MultiModality
        bridge_module.MultiModality = SimpleNamespace(AUDIO="audio", TEXT="text")
        try:
            bridge = bridge_module.OmniBridge()
            bridge.conversation = FakeConversation()
            bridge.ready_event.set()
            with bridge.response_state_lock:
                bridge._queue_response_request_locked("first", "initiative")
                serial = bridge.response_request_serial
                bridge._cancel_response_timer_locked()
                bridge._flush_response_requests(serial)
            self.assertEqual(len(bridge.conversation.responses), 1)
            self.assertEqual(bridge.conversation.responses[0]["instructions"], "first")

            with bridge.response_state_lock:
                bridge.response_ids.add("response-1")
                bridge._queue_response_request_locked("second", "tool_result")
                self.assertEqual(len(bridge.pending_response_requests), 1)
                bridge.note_response_created("response-2")
                self.assertEqual(len(bridge.pending_response_requests), 0)
                bridge.note_response_done("response-1", "cancelled")
                self.assertEqual(len(bridge.response_ids), 1)
                bridge.note_response_done("response-2", "cancelled")
                self.assertEqual(len(bridge.response_ids), 0)
        finally:
            bridge_module.MultiModality = original_multi_modality

    def test_callback_maps_realtime_events_without_model_requests(self):
        events = []
        original_emit = bridge_module.emit
        logs = []
        original_debug_log = bridge_module.debug_log
        bridge_module.emit = events.append
        bridge_module.debug_log = lambda kind, payload, level=None: logs.append((kind, payload, level))
        try:
            callback = bridge_module.BridgeCallback(
                bridge_module.threading.Event(),
                bridge_module.threading.Event(),
                "model=mock; endpoint=mock; dashscope=test",
            )
            callback.on_event({"type": "conversation.item.input_audio_transcription.completed", "transcript": "hello"})
            callback.on_event({"type": "response.audio_transcript.done", "transcript": "reply"})
            callback.on_event({"type": "response.audio.delta", "delta": "AQID"})
            callback.on_event({"type": "response.done", "response": {"id": "r1", "usage": {"input_tokens": 1, "output_tokens": 2}}})
            self.assertEqual([event["type"] for event in events], [
                "user.transcript", "assistant.text.done", "assistant.audio.delta", "model.usage", "assistant.response.done",
            ])
            self.assertEqual(events[0]["text"], "hello")
            self.assertEqual(events[2]["data"], "AQID")
            content_logs = [payload for kind, payload, _ in logs if kind == "conversation.content"]
            self.assertEqual([payload["role"] for payload in content_logs], ["user", "assistant"])
            self.assertEqual(content_logs[0]["text"], "hello")
            self.assertEqual(content_logs[1]["text"], "reply")
        finally:
            bridge_module.emit = original_emit
            bridge_module.debug_log = original_debug_log


if __name__ == "__main__":
    unittest.main()
