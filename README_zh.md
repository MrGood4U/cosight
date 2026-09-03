# Cosight

Cosight 是一个 Windows 桌面端实时多模态对话客户端。它可以把兼容的实时模型连接到用户的麦克风、共享屏幕、语音输出和智能体控制的屏幕绘画能力上。用户还可以在不同的 Role 角色之间灵活切换，让每次对话拥有不同的身份、行为、收听语种、输出语种、音色、知识和能力。

English version: [README.md](README.md)

## 产品定位

Cosight 的核心是“对话 + 屏幕视觉 + 语音交互 + 屏幕交互”：

- 模型可以听见用户通过麦克风说的话。
- 模型可以看见用户分享的整个屏幕或指定窗口。
- 模型可以通过语音回应，用户可以选择麦克风和音频输出设备。
- 在 Role 授权绘画能力并分享整个屏幕后，模型可以在用户电脑的实际屏幕上绘制标记、箭头、圆圈、方框等图形，并接收包含绘制结果的后续屏幕帧，从而检查和修正自己的绘画。
- Role 可以决定模型能否使用绘画（包含写字）、听觉、语音输出和主动性等能力。
- Core 字幕功能可以把模型的语音回复转换为字幕并显示在屏幕上。

Cosight 不把智能体固定成一种身份。用户可以创建多个 Role，并在不同对话开始前选择不同角色。每个角色都可以拥有独立的身份、目标、行为、对话流程、约束、收听语种、输出语种、音色、知识和能力组合。

## 主要能力

- **实时对话**：通过 Python bridge 使用 WebSocket 连接 Qwen Omni Realtime 或其他兼容的实时模型。
- **屏幕视觉**：分享整个显示器或窗口，让模型理解当前画面。
- **听觉与语音输出**：使用选定的麦克风作为输入，并通过选定的 Windows 音频输出设备播放模型语音。
- **屏幕绘画**：在整个屏幕捕获模式下，Role 授权的统一绘画能力可以使用透明桌面覆盖层绘制图形、文字、标签和提示，并看到自己的绘制结果。
- **Core 字幕**：Settings 中的核心开关，用于显示模型语音回复的字幕，不需要模型额外调用工具。
- **文字输入**：聊天会话中的文字消息会复用 Listen 渠道，进入与语音相同的后续处理流程。
- **Role 角色系统**：创建和编辑可复用的角色身份与行为配置。
- **多个模型配置**：保留原有单模型实时链路，也可以在模型页面开启 Harness，分别配置 Brain、Listen、Speak 和 See；Draw 使用本地透明画布执行器，不需要模型。
- **聊天上下文导入导出**：可以导出文本消息和能力调用记录，也可以导入之前的聊天记录作为上下文。导出文件不会嵌入屏幕截图或音视频媒体文件。

## 演示视频

点击缩略图即可在 YouTube 上观看演示视频。

**模拟面试官：展示听和说的能力**

[![模拟面试官：展示听和说的能力](https://img.youtube.com/vi/5nD141eg7qk/hqdefault.jpg)](https://youtu.be/5nD141eg7qk)

**模拟面试官：展示绘画能力**

[![模拟面试官：展示绘画能力](https://img.youtube.com/vi/wMkcMLySvB4/hqdefault.jpg)](https://youtu.be/wMkcMLySvB4)

**模拟面试官：展示屏幕视觉能力**

[![模拟面试官：展示屏幕视觉能力](https://img.youtube.com/vi/-eNaUFuGlAA/hqdefault.jpg)](https://youtu.be/-eNaUFuGlAA)

**和模拟 DM 玩跑团**

[![和模拟 DM 玩跑团](https://img.youtube.com/vi/blt87WVt454/hqdefault.jpg)](https://youtu.be/blt87WVt454)

### 屏幕捕获说明

绘画（包括屏幕写字）和 Core 字幕需要分享整个显示器，因为透明覆盖层需要准确定位在真实桌面上。窗口捕获可以用于视觉理解，但不会启用依赖全屏坐标的透明覆盖层能力。

## 如何使用

安装 Windows 安装包后，可以按照下面的流程配置模型、选择角色并开始聊天。

### 1. 打开聊天会话页面

聊天会话页面是软件的起始页面。你可以在这里选择角色、分享显示器或窗口，
并开始实时聊天。

![Cosight 聊天会话页面](docs/images/01-home.png)

### 2. 添加实时模型

打开左侧的 **模型** 页面，点击 **添加模型**，填写模型别名、模型名称、实时
URL 和 API Key。模型别名用于区分多个使用相同模型的配置。保存后选择要使用的模型。

![Cosight 模型配置页面](docs/images/02-model-configuration.png)

截图中的 API Key 有意留空。实际使用时请填写你自己的兼容实时模型服务地址和 API Key，
不要把真实凭据提交到仓库。

> **阿里云百炼端点说明：** 如果使用 `qwen3.5-omni-flash-realtime`，国内站 API Key
> 请填写 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime`。如果 API Key 来自新加坡站或
> 国际站，请改用 `wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime`。API Key 和
> WebSocket 地址必须属于同一个站点或区域，不能混用。

### 3. 选择或配置角色

打开 **角色** 页面，选择 `Default` 或官方示例角色。你也可以创建自定义角色，
为它设置身份、行为、收听语种、输出语种、音色、知识和能力。

![Cosight 角色配置页面](docs/images/03-role-configuration.png)

### 4. 返回聊天会话并开始聊天

返回 **聊天会话** 页面，在顶部的角色选择框中选择角色，然后点击 **分享屏幕**。
选择要分享的显示器或窗口，等待屏幕加载完成后，点击 **开始聊天** 并正常说话。

![Cosight 聊天会话角色选择](docs/images/04-home-role-selection.png)

麦克风、音频输出设备和界面语言可以在 **设置** 页面中调整。设置页面会将设备、
连接与语言、行为开关分别放在不同区域。请先对着麦克风说话，确认音量条能够正常变化。

![Cosight 设置页面](docs/images/05-settings.png)

停止聊天只会结束实时模型会话，不会自动停止屏幕分享；屏幕分享可以独立控制。

## 从源码运行

### 开发环境要求

- Windows 10 或更高版本
- Node.js 和 npm
- Python 3.12 或更高版本（旧的单模型模式和 Windows 打包需要）
- Go 1.27 或更高版本（Harness 模式和 Windows 打包需要）
- 一个兼容的实时模型服务地址和 API Key

安装 JavaScript 和 Python 依赖：

```powershell
npm ci
python -m pip install -r requirements.txt

# 开启 Harness 开发时构建 Go 编排器：
npm run build:harness
```

启动开发客户端：

```powershell
npm run dev
```

如果系统中不能通过 `python` 找到 Python，可以指定 Python 解释器：

```powershell
$env:COSIGHT_PYTHON = "C:\Path\to\python.exe"
npm run dev
```

只构建前端生产文件：

```powershell
npm run build
```

## 自行编译 Windows 安装包

项目提供了一键 Windows 打包脚本。脚本会自动完成以下工作：

1. 构建独立的 Go Harness。
2. 创建独立的 Python 打包虚拟环境并安装 bridge 依赖。
3. 使用 PyInstaller 打包 realtime bridge 和 prompt preview 两个 Python 入口。
4. 构建 Vite 前端。
5. 使用 Electron Builder 生成 x64 NSIS 安装程序。
6. 把 Go Harness、Python 运行时、模型依赖、官方示例角色和能力 prompt 一起放入安装包。

执行普通打包：

```powershell
npm run package:win
```

打包前清理旧产物：

```powershell
npm run package:win -- -Clean
```

如果打包用的 Python 不在 PATH 中：

```powershell
$env:COSIGHT_BUILD_PYTHON = "C:\Path\to\python.exe"
npm run package:win
```

安装包会生成在：

```text
release/Cosight-Setup-<version>-x64.exe
```

安装程序采用所有用户安装模式，会请求管理员权限，以便安装到 `Program Files`。最终用户安装后不需要另外安装 Python、Node.js、npm、pip 或项目依赖。打包机器本身仍然需要 Node.js、npm 和 Python。

面向公开发布时，还应补充正式的应用图标和 Windows 代码签名证书。当前打包流程适合开发测试和内部分发。

## 项目目录

```text
electron/                 Electron 主进程、preload 和桌面透明覆盖层
src/                      React 前端和本地化 UI
python/                   Qwen Omni 实时 bridge 和 prompt preview
harness/                  Go 多模型 Harness 和固定 JSON 信号协议
abilities/                可扩展能力及其 prompt、运行时代码
  drawing/                统一的绘画与屏幕写字运行时契约
  writing/                向后兼容的内部写字工具契约
  initiative/             客户端主动性运行时
data/sample-roles.json    随应用发布的官方示例角色
packaging/                PyInstaller 配置
scripts/                  打包和示例角色维护脚本
```

未来新增能力必须放在根目录的 `abilities/` 下，并为每项能力建立独立文件夹。读屏幕、听和说属于 Core 的基础实时链路，不需要单独拆成能力目录。

## 用户数据、日志和安全

Cosight 的用户数据保存在：

```text
%APPDATA%\cosight
```

这里包括模型配置、角色、知识文件和日志。API Key 通过 Electron 的 Windows 本地保护存储机制保存。不要把用户配置、API Key、日志或本地知识文件提交到 Git。

日志目录是：

```text
%APPDATA%\cosight\logs
```

日志会记录协议事件、能力调用结果、异常、进程退出和数据长度，但不会记录原始音频或视频帧。

结构化日志包含 `INFO`、`ERROR` 和 `DEBUG` 级别：常规运行日志为 `INFO`，失败和异常为 `ERROR`。
Harness 的 Brain、See、Speak 耗时统计，以及供未来评估使用的具体对话内容，均以 `DEBUG` 级别写入日志，
不会显示在软件界面中。

开启多模型 Harness 后，会额外生成 `cosight-harness.log`。其中包含
`listen`、`see`、`brain`、`speak`、`draw` 各阶段的开始/结束时间、请求 ID、
等待/超时、模型响应长度、See 缓存命中和屏幕帧捕获状态。排查一次对话时，
可用同一个 `requestId` 或 `listenEventId` 串起完整链路：

```text
%APPDATA%\cosight\logs\electron.log
%APPDATA%\cosight\logs\cosight-harness.log
```

日志不会保存 API Key、完整提示词、原始截图、原始音频或视频帧。

## 官方示例角色

官方示例角色维护在 `data/sample-roles.json`，打包时会随应用一起进入安装包，帮助新用户快速了解 Cosight 的角色系统。

开发时如果需要同步示例角色：

```powershell
npm run sync:sample-roles
```

示例角色不能包含 API Key、用户知识文件或本机绝对路径。
