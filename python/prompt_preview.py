#!/usr/bin/env python3
"""Build a role prompt preview without opening a realtime session."""

import json
import sys

from qwen_bridge import build_session_instructions


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        role = payload.get("role") if isinstance(payload, dict) else None
        if not isinstance(role, dict):
            role = None
        prompt = build_session_instructions(
            bool(payload.get("canvasEnabled")) if isinstance(payload, dict) else False,
            bool(payload.get("writingEnabled", payload.get("captionsEnabled", False))) if isinstance(payload, dict) else False,
            bool(payload.get("screenVisionEnabled")) if isinstance(payload, dict) else False,
            bool(payload.get("listeningEnabled")) if isinstance(payload, dict) else False,
            bool(payload.get("speakingEnabled")) if isinstance(payload, dict) else False,
            bool(payload.get("initiativeEnabled")) if isinstance(payload, dict) else False,
            role,
        )
        # ASCII escaping keeps the JSON transport safe on Windows locales where
        # the child process stdout encoding is not UTF-8.
        sys.stdout.write(json.dumps({"ok": True, "prompt": prompt}, ensure_ascii=True))
    except Exception as error:  # pragma: no cover - surfaced to the desktop UI
        sys.stdout.write(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=True))
        raise


if __name__ == "__main__":
    main()
