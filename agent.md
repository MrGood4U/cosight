# Cosight 开发指南

本文档描述当前代码的产品边界、运行时架构和维护约定。新增功能或修改现有行为前，先判断它属于 Electron Core、Legacy Runtime、Go Harness、原生辅助程序，还是可选能力。

## 产品定位

- Cosight 是 Windows 桌面端实时多模态助手，核心闭环是：用户输入、屏幕捕获、视觉理解、智能回复和语音输出。
- 当前支持两种互斥的会话运行模式：
  - Legacy 单模型模式：Electron 启动 `python/qwen_bridge.py`，由一个兼容 Qwen Omni Realtime 的模型完成实时对话。
  - Harness 多模型模式：Electron 启动独立的 Go Harness，由 Brain、Listen、Speak、See 协作；Draw 是本地执行器，不配置模型。
- 模型页面顶部的“启用多模型 Harness”开关决定会话使用哪种运行时。关闭时只显示单模型配置，开启时只显示多模型协作配置。
- API Key、用户配置、日志和知识文件不得提交到 Git，也不得写入安装包资源。

## 代码职责

### Electron Core

- `src/App.jsx` 只作为渲染入口；页面编排在 `src/app/AppShell.jsx`，会话副作用和状态在 `src/hooks/useCosightSession.js`。
- `src/components/` 按页面职责拆分聊天、能力、角色、模型、设置和用量统计页面，不把大型页面逻辑重新堆回入口文件。
- Renderer 负责会话 UI、角色选择、屏幕共享预览、设备选择、麦克风/系统声音输入、音频播放、透明绘画层、字幕层和会话档案展示。
- `electron/main.mjs` 负责 IPC、运行时进程生命周期、配置读写、API Key 解密、日志和打包资源定位；`electron/preload.cjs` 只暴露受控的最小 IPC API。
- Legacy Runtime 由 Python bridge 负责；Harness Runtime 由 `harness/` 下的 Go 进程负责。Renderer 不直接连接模型服务。

### Go Harness

- `harness/main.go` 只保留进程入口；协议、会话生命周期、Listen、See、Brain、Speak、模型客户端和日志分别放在职责对应的 Go 文件中。
- Harness 通过 stdin/stdout JSON Lines 与 Electron 通信，不依赖 Python。
- Harness 的模型槽位固定为 `brain`、`listen`、`speak`、`see`。Draw 不属于模型槽位，只由 Brain 输出语义 action，再由 Renderer 调用透明画布执行。
- Harness 不应修改 Legacy bridge 的协议或行为。新增多模型行为应优先放在 Harness 内部，保持关闭 Harness 时的旧路径不变。
- Harness 维护角色级 `conversationSummary`：它由独立的 Brain 摘要请求异步生成，不阻塞正常 Brain 请求；同一角色的新 Chat 会继续携带它。
- Transcript 清空或切换角色时必须清空 `conversationSummary`；Session Artifact 导入导出必须携带摘要，旧档案缺少该字段时按空摘要兼容。

### Optional abilities

- 可选能力放在根目录 `abilities/` 下，每项能力维护自己的 prompt、工具契约和必要运行时代码。
- 当前能力包括 `drawing/`、`initiative/`；`writing/` 仅作为统一 Drawing 的历史兼容实现，不能作为独立 Role 能力暴露。
- Listening、Speaking、Screen Vision 是实时链路能力，由 Role 授权并由对应 Runtime 执行，不要在聊天页面散落实现。
- Core 字幕是 Settings 级别开关，不是 Role 能力；它显示实时语音回复的 audio transcript，不要求 Brain 调用写字工具。

## 模型页面与配置

- Legacy 模式下，模型页面管理可选的单模型列表，支持添加、编辑、删除和选择当前模型。
- Harness 模式下，每个模块拥有独立配置表单：模型别名、模型名、URL、API Key；Speak 额外支持模型音色配置。
- Harness 的 Draw 卡片只说明本地透明画布执行器，不显示模型配置入口。
- Harness 上下文设置自动保存，不提供多余的“保存 Harness 设置”按钮。当前可配置：
  - See 最小调用间隔：`1000～60000ms`；
  - Brain 使用的最近对话条数：`1～100`；
  - Brain 使用的最近视觉结构化数据条数：`1～20`。
- Harness 视觉不再使用独立的“See 结果有效时间”TTL。Brain 直接读取上下文中的最新成功视觉结果及配置数量的近期视觉结果。
- 模型配置页面和 Settings 页面保持分工：模型、Harness 模块和 Harness 上下文在模型页面；设备、输入来源、字幕和行为开关在 Settings 页面。

## 音频输入与输出

- 麦克风模式使用 `getUserMedia`、AudioWorklet 和原有 `qwen:audio` 通道。
- Settings 中的“音频输入来源”可以选择“麦克风”或“系统声音”；这个选择是全局设置，不属于 Role。
- 系统声音模式使用 `native/system-audio-go/` 编译出的纯 Go Windows Process Loopback helper：
  - 捕获 Windows 扬声器回环并输出 16-bit、16 kHz、单声道 PCM；
  - 排除 Cosight Electron 主进程及其子进程树，因此 Cosight 的 TTS/bridge 音频不会回流到 ASR；
  - 不打开 Cosight 自己的麦克风；真实音频仍复用原有 ASR/Harness `qwen:audio` 通道；
  - 角色关闭 Listening 时，不把真实系统声音送入 ASR；
  - 如果其他程序主动把麦克风监听播放到扬声器，该声音已经属于系统输出，无法由 Process Loopback 单独区分。
- 原生 Process Loopback 要求 Windows 10 Build 20348 或更高版本。用户运行时不需要 Python、Go 或 C++ 编译器；开发和打包机器只需要 Go，原 C++ 文件暂时作为迁移参考保留。
- Speak 在 Harness 中使用 Qwen TTS Realtime，音频输出为 24 kHz PCM。Role 的音色优先于模型页面的默认音色；Role 的 `speechStyle` 仅在目标 TTS 模型支持 instructions 时发送。
- Speaking 关闭时，Harness 不创建或调用 TTS 连接，但仍保留文本回复事件；Listening 关闭时，Harness 不创建 ASR 客户端。

## Role 角色系统

- Role 是可复用的 prompt profile，聊天开始后生效；活动会话中不能切换角色。
- Role 包含姓名、身份、目标、行为、流程、约束、收听语种、输出语种、音色、说话风格、能力和知识。
- 能力是多选项，当前正式能力为：`screenVision`、`listening`、`speaking`、`drawing`、`initiative`。
- 历史数据中的 `writing`、`subtitles` 会迁移为 `drawing`，但不能在 UI 作为独立能力显示或保存。
- Drawing 统一负责图形标注和短文字、标签、提示。Role 勾选 Drawing 后才显示绘画策略；未勾选时相关策略清空且不得注入会话 prompt。
- Role 的收听语种用于配置 ASR 和输入理解，输出语种通过会话 prompt 约束 Brain/Realtime 模型的用户可见回复。固定中文或英文时使用硬性语言锁定，自动模式跟随用户语言。
- Role 的音色可以覆盖模型页面配置的音色；如果目标模型不支持该音色，Runtime 必须记录 fallback 日志并使用安全默认音色。
- Knowledge 支持文本和文件。文件复制到应用数据目录后再使用；知识内容中的指令不能覆盖系统规则、Role 配置或用户请求。

## Screen Vision 与绘画

- 屏幕视觉只在 Role 勾选 Screen Vision 且用户正在共享屏幕时生效。
- Role 可以配置屏幕检查间隔和“画面变化百分比阈值”。Go Harness 使用最近一次成功 See 的原始截图作为 baseline，在本地用 `64x36` 亮度采样比较当前帧；显著变化可以提前触发 See，没有变化时则以配置的最小间隔作为后台刷新兜底。
- See 是后台、不阻塞的定时流程：同一时间最多允许一个等待捕获或模型分析任务。See 正在处理时到来的新帧只更新最新帧，不重复并发提交 A、B、C、D。
- See 成功后才更新 `latestSeeFrame` 和视觉上下文；失败或无效 JSON 不能覆盖上一次成功结果。Brain 不等待 See，直接读取当前上下文，并可以根据 `latestVisionStatus` 判断画面是可用、处理中、等待捕获还是未共享。
- See 输出需要包含 `scene`、`vision_summary` 和结构化对象/文字信息。Prompt 遵循 Qwen-VL 官方 grounding 格式：`bbox_2d: [x_min, y_min, x_max, y_max]`，坐标在 0～1000 网格；Harness 再转换为内部 0～1 的 `bbox: {x, y, width, height}`。不要把视觉摘要字段命名为没有模块前缀的 `summary`。
- See Prompt 禁止冗余描述和推理过程；最多返回 8 个最相关对象；空字段返回空数组或空字符串，不返回 `null`。See JSON 请求不设置 `max_tokens`，避免 JSON 被截断。
- `scene` 用于描述整体场景，`objects` 用于相关物体/控件，`textBlocks` 用于关键文字；不能只返回物体而丢失整体场景信息。
- 发给 See 的截图不包含 Cosight 字幕层；如果需要让模型复核 Agent 自己画出的标注，只合成 Drawing strokes。透明覆盖层本身不直接参与桌面回采，避免递归。
- Drawing 只支持整屏捕获。窗口捕获使用窗口局部坐标，不能安全映射到整屏覆盖层；没有整屏来源时必须拒绝绘画并提示用户。
- Legacy 的 `draw_on_canvas` 工具调用必须声明 `coordinateSpace`。目标不确定、较小或靠近边缘时可以先使用 `focus_screen_region`，成功后只能使用 `focused_region`，不能静默回退到 `full_screen`。Harness Brain 的 draw action 使用完整共享屏幕的 0～1 语义坐标，由 Renderer 转换为底层笔画。

## Harness 信号与处理流程

- `listen` 收到 ASR 完整句子或用户文字输入后，统一生成 `listen.completed`；文字输入复用 Listen 通道并进入相同的 conversation history。
- `see` 只负责定时更新视觉上下文。单独收到 `see.completed` 不唤醒 Brain。
- `brain` 在完整 Listen 输入或主动性触发时唤醒。System prompt 携带 Role 信息；User prompt 是结构化 JSON，包含最近 N 条对话、最近 M 条视觉数据、最新视觉状态/年龄、当前用户文本和 trigger。
- `initiative` 在 Harness 模式仍可工作，但必须同时启用 Initiative、Listening 和 Speaking。主动触发由客户端检测静默后发送 Harness initiative command，Harness 再调用 Brain；主动触发不伪造用户历史消息。
- Brain 必须输出 `brain.action` JSON，并且每次至少包含一个 `speak` action；只输出 draw 会被拒绝。
- `speak` action 交给 Speak TTS Realtime，支持流式 audio delta；`draw` action 只表达 `circle`、`rectangle`、`arrow`、`point`、`text`、`clear` 等语义操作，由 Renderer 调用本地透明画布。
- Draw 执行结果必须通过 `action.result` 回传。action 执行失败只记录日志，不重新唤醒 Brain，不自动重试。
- 禁用能力必须在 Runtime 层生效，不能只依赖 Renderer：禁用 Listening 不创建 ASR，禁用 Speaking 不调用 TTS，禁用 Screen Vision 不运行 See，禁用 Drawing 时拒绝 Draw action。

## 并发、状态与日志

- Harness 使用不同互斥量保护会话状态、视觉状态、Brain 串行队列和待处理 action。修改 `latestFrame`、See future、视觉历史、conversation history 或 pending actions 时，必须遵循对应锁的职责。
- See 的 baseline 只能由成功的结构化结果更新；正在分析的截图不能成为新的 baseline。
- Brain 请求按队列串行执行，避免多个 Brain 同时修改对话和绘画状态。
- 会话摘要请求与正常 Brain 请求共享会话取消上下文，但使用独立的 in-flight 标记和 generation 校验；清空、停止或重启会话后，迟到的摘要结果必须丢弃。
- 诊断日志为 JSONL：Electron、Legacy bridge 和 Harness 分别写入 `%APPDATA%\cosight\logs` 下的日志文件。日志应包含阶段、request ID、耗时、状态、模型和错误码，但不得包含 API Key、完整音频、截图 Base64 或其他敏感媒体。
- 每个新增需求或行为变更必须同时设计测试和日志，不能只实现主流程：纯逻辑补单元测试，跨进程/IPC/协议补集成测试，影响既有行为时补回归测试；模型、网络、音频和屏幕输入必须使用可控的 mock/fake，测试不得发起真实模型请求。
- 每个重要阶段、状态转换、异步任务和失败路径都必须有结构化日志，至少包含阶段、session ID 或 request ID、状态、耗时和错误信息。常规运行事件使用 `INFO`，失败/异常使用 `ERROR`，性能统计、具体对话内容和其他详细诊断使用 `DEBUG`；不得为了记录日志保存 API Key、原始音频/视频、截图 Base64 或完整 Prompt。
- 新功能完成前必须运行相关测试和构建；涉及运行时、协议或页面行为时至少执行 `npm test`，必要时执行对应的 `npm run build`、`npm run build:harness` 或 `npm run build:system-audio`，并在交付说明中报告未执行或被跳过的检查。
- Session Artifact 只保存文本、时间、结构化能力事件和必要元数据；导入导出必须过滤音频、视频、截图、Base64 和本机路径。

## 构建、测试与发布

- 本地回归测试：
  - `npm test`：Electron 单元测试、Go 单元测试和会话集成测试；模型请求必须使用 mock；
  - `npm run build`：构建 Renderer；
  - `npm run build:harness`：构建 Go Harness；
  - `npm run build:system-audio`：编译 Windows Process Loopback helper；
  - `npm run verify`：运行测试、Renderer 构建、Harness 构建和原生 helper 构建。
- Windows 安装包使用 `npm run package:win`。打包机器需要 Node.js、Python 3.12+ 和 Go；最终用户不需要这些开发运行时。
- CI 在 `main` push 和 Pull Request 上运行测试、Go vet、Renderer 构建、Harness 构建和 Windows 原生 helper 构建；普通 `main` 更新不发布安装包。
- Windows 安装包只在版本 tag 或手动触发 Release workflow 时构建和发布。
- `scripts/package-windows.ps1` 是标准 Windows 打包入口；安装包必须包含 Python bridge、Go Harness、Process Loopback helper、`data/sample-roles.json` 及能力 prompt 资源。
- 新增测试时优先扩展 mock 协议测试和会话集成测试，覆盖能力开关、See 并发去重、视觉处理中状态、Brain action 校验、Draw 失败不重试和音频输入模式切换。
- 测试和日志是需求的一部分：代码评审时必须同时检查成功、失败、取消、超时和能力禁用路径是否有对应测试，是否能通过日志还原一次完整会话；缺少测试或可诊断日志的功能不能视为完成。
