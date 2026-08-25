"""Model-facing contract for the transparent drawing ability."""

from pathlib import Path


ABILITY_ID = "drawing"
TOOL_NAME = "draw_on_canvas"
FOCUS_TOOL_NAME = "focus_screen_region"
PROMPT_PATH = Path(__file__).with_name("prompt.md")
DISABLED_INSTRUCTIONS = (
    "当前会话没有启用透明画布，也没有可调用的绘画工具。"
    "不要尝试绘制或声称可以在屏幕上绘制；如果用户需要标注，请用语音或文字描述位置。"
)
FALLBACK_INSTRUCTIONS = (
    "当前会话启用了覆盖在用户共享屏幕预览上的透明标注画布。"
    "你可以调用 draw_on_canvas；坐标使用相对于屏幕捕获画面的归一化坐标，左上角是 (0,0)，右下角是 (1,1)。"
    "strokes 通常使用对象数组，每笔使用 {points:[{x,y}, ...]}；客户端同时兼容点的数组写法 [x,y]。不要把 strokes 写成多层嵌套的无意义数组。每条 stroke 至少包含两个按绘制顺序排列的 points；绘制单个点时使用两个完全相同的坐标，不能只提供一个 point。"
    "color 使用 #RRGGBB，width 范围为 1 到 24，opacity 范围为 0.1 到 1。"
    "如果用户只要求清除当前绘画而不立即重绘，必须调用 clear=true、coordinateSpace=full_screen、strokes=[]；这是独立的整屏清除操作，不依赖之前的局部定位状态。"
    "目标较小、靠近屏幕边缘或整屏定位不确定时，先调用 focus_screen_region 给出目标的粗略中心和可选的粗略宽高；客户端会在真实捕获帧上裁切并放大约 2 倍，随后返回局部坐标映射。收到局部复核帧后，必须用 coordinateSpace=focused_region 调用绘画工具，客户端会把局部坐标还原到整屏。不要凭粗略中心直接画最终边界。"
    "绘画工具完成后客户端会优先发送一张包含最新绘制的高质量复核帧，必须基于这张最新帧检查自己的框；用户要求框选时必须按定位、坐标校准、绘制边界、复核四步执行；以完整捕获帧为唯一坐标参考，先确定目标像素边界 L,T,R,B 和帧宽高 W,H，再使用 L/W、T/H、R/W、B/H 换算坐标。"
    "画布没有独立的圆形 primitive；圆必须是一条由许多短线段组成的闭合多边形笔画，不能只传圆心、直径两端、四个点或一条线。先确定中心(cx,cy)和横纵半径(rx,ry)，按 theta=0,2pi/32,...,2pi*31/32 生成 x=cx+rx*cos(theta), y=cy+ry*sin(theta)，最后追加第一个点闭合；建议25到41个points，不要拆成多条线段。看起来是圆的屏幕图形应按像素半径分别除以捕获帧宽高得到rx和ry。"
    "矩形点顺序固定为左上、右上、右下、左下、左上；校正框选必须重新阅读最新帧，并使用 clear=true 清除旧框后重绘。"
    "定位、绘制和复核是内部工具步骤；调用工具前后不要朗读过程性说明，也不要为每个工具调用单独回复用户。直接调用下一步工具，只有完成最终复核后才用一条简短语音或文字说明结果。"
    "透明画布绘画只支持整屏捕获；窗口捕获的视频坐标是窗口局部坐标，不能安全映射到实际屏幕覆盖层。窗口捕获时不要调用绘画工具，应请用户改为分享整屏。"
    "每次调用 draw_on_canvas 都必须明确提供 coordinateSpace；focus_screen_region 成功后必须使用 focused_region，否则客户端会拒绝调用。"
    "只有在确实需要视觉标注时才绘制；工具失败时不要声称已经绘制成功。"
)
TOOL = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": "在用户共享屏幕上的透明画布中绘制标注、箭头、圈选或简短示意线。",
        "parameters": {
            "type": "object",
            "properties": {
                "coordinateSpace": {
                    "type": "string",
                    "enum": ["full_screen", "focused_region"],
                    "description": "坐标来源。通常使用 full_screen；刚完成 focus_screen_region 后，必须使用 focused_region，客户端会将局部坐标映射回完整捕获帧。",
                },
                "clear": {
                    "type": "boolean",
                    "description": "是否先清除画布上已有的智能体绘画；如果只清除不重绘，请使用 clear=true、strokes=[]，无需依赖之前的局部定位状态。",
                },
                "strokes": {
                    "type": "array",
                    "description": "按绘制顺序排列的笔画对象列表；每项必须是 {points:[{x,y}, ...]}，不要使用 [[{x,y}, ...]]。坐标均为 0 到 1 的屏幕归一化坐标。",
                    "maxItems": 32,
                    "items": {
                        "type": "object",
                        "properties": {
                            "points": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 128,
                                    "items": {
                                        "description": "标准坐标对象 {x,y}，或兼容格式 [x,y]；两种格式都使用 0 到 1 的归一化坐标。",
                                        "anyOf": [
                                            {
                                                "type": "object",
                                                "properties": {
                                                    "x": {"type": "number", "minimum": 0, "maximum": 1},
                                                    "y": {"type": "number", "minimum": 0, "maximum": 1},
                                                },
                                                "required": ["x", "y"],
                                            },
                                            {
                                                "type": "array",
                                                "minItems": 2,
                                                "maxItems": 2,
                                                "items": {"type": "number", "minimum": 0, "maximum": 1},
                                            },
                                        ],
                                    },
                            },
                            "color": {
                                "type": "string",
                                "description": "十六进制颜色，例如 #FF4D6D。",
                                "pattern": "^#[0-9A-Fa-f]{6}$",
                            },
                            "width": {
                                "type": "number",
                                "minimum": 1,
                                "maximum": 24,
                                "description": "画笔宽度，单位为屏幕像素。",
                            },
                            "opacity": {
                                "type": "number",
                                "minimum": 0.1,
                                "maximum": 1,
                            },
                        },
                        "required": ["points"],
                    },
                },
            },
            "required": ["coordinateSpace", "strokes"],
        },
    },
}

FOCUS_TOOL = {
    "type": "function",
    "function": {
        "name": FOCUS_TOOL_NAME,
        "description": "在用户共享屏幕的真实捕获帧上，围绕一个粗略位置裁切并放大局部区域，帮助后续绘画精确定位目标。",
        "parameters": {
            "type": "object",
            "properties": {
                "x": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "目标粗略中心的整屏归一化 x 坐标。",
                },
                "y": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "目标粗略中心的整屏归一化 y 坐标。",
                },
                "estimatedWidth": {
                    "type": "number",
                    "minimum": 0.01,
                    "maximum": 1,
                    "description": "目标粗略宽度占完整捕获帧的比例；不确定时可以省略。",
                },
                "estimatedHeight": {
                    "type": "number",
                    "minimum": 0.01,
                    "maximum": 1,
                    "description": "目标粗略高度占完整捕获帧的比例；不确定时可以省略。",
                },
            },
            "required": ["x", "y"],
        },
    },
}

TOOLS = (FOCUS_TOOL, TOOL)


def load_instructions() -> str:
    """Load the editable prompt with a safe fallback for packaged builds."""
    try:
        instructions = PROMPT_PATH.read_text(encoding="utf-8").strip()
        if instructions:
            return instructions
    except (OSError, UnicodeError):
        pass
    return FALLBACK_INSTRUCTIONS
