"""Model-facing contract for the optional on-screen writing ability."""

from pathlib import Path

ABILITY_ID = "writing"
TOOL_NAME = "show_caption"
PROMPT_PATH = Path(__file__).with_name("prompt.md")
DISABLED_INSTRUCTIONS = (
    "当前会话没有启用屏幕写字能力，也没有可调用的写字工具。"
    "不要尝试在屏幕上写字或声称已经写字；如果用户需要文字说明，请用对话回复。"
)
FALLBACK_INSTRUCTIONS = (
    "当前会话启用了覆盖在用户共享屏幕上的写字层。"
    "你可以调用 show_caption 在屏幕上显示简短文字、标签或提示。"
    "写字与 Core 自动字幕、绘画相互独立；工具失败时不要声称文字已经显示。"
)
TOOL = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": "在用户共享屏幕上的透明写字层中显示或清除简短文字。",
        "parameters": {
            "type": "object",
            "properties": {
                "clear": {
                    "type": "boolean",
                    "description": "是否清除当前写字内容；清除写字不会清除 Agent 的绘画或 Core 自动字幕。",
                },
                "text": {
                    "type": "string",
                    "maxLength": 500,
                    "description": "要显示的简短文字；clear 为 true 时可以省略。",
                },
                "x": {"type": "number", "minimum": 0, "maximum": 1, "description": "文字框中心的水平归一化坐标，默认 0.5。"},
                "y": {"type": "number", "minimum": 0, "maximum": 1, "description": "文字框中心的垂直归一化坐标，默认 0.88。"},
                "fontSize": {"type": "number", "minimum": 16, "maximum": 96, "description": "文字字号，单位为屏幕像素。"},
                "color": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$", "description": "文字颜色，例如 #FFFFFF。"},
                "backgroundColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$", "description": "文字背景颜色，例如 #111827。"},
                "backgroundOpacity": {"type": "number", "minimum": 0, "maximum": 1, "description": "文字背景透明度。"},
                "durationMs": {"type": "number", "minimum": 0, "maximum": 60000, "description": "自动隐藏时间，单位毫秒；省略时默认 5000，0 表示持续显示。"},
            },
        },
    },
}


def load_instructions() -> str:
    """Load the editable prompt with a safe fallback for packaged builds."""
    try:
        instructions = PROMPT_PATH.read_text(encoding="utf-8").strip()
        if instructions:
            return instructions
    except (OSError, UnicodeError):
        pass
    return FALLBACK_INSTRUCTIONS
