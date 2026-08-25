# Cosight abilities

This directory contains optional abilities that can be enabled per session and
per role. Each ability owns its model-facing prompt and tool contract.

## Current abilities

- `drawing/` — transparent screen annotations, including circles, arrows,
  rectangles, and points. It also owns the `focus_screen_region` helper for
  edge-aware local zoom before precise drawing when full-frame location is uncertain.
- `writing/` — optional agent-controlled text, labels, and prompts rendered over the shared screen.
- `initiative/` — the Core protocol contract for proactive turns; its timeout
  and trigger behavior are supplied by the selected Role.

Core Subtitles is not a Role ability. It is a Settings-level Core feature that
automatically renders each Cosight spoken response from its realtime audio
transcript; it does not require the model to call the writing tool.

Screen vision, listening, and speaking remain foundational realtime capabilities
in the Python bridge because they are the transport-level inputs and output of
the core conversation runtime rather than optional feature modules.

When adding a new optional ability, create a new directory with its prompt and
runtime/tool contract. Keep the renderer or Electron integration in the core
only when it is shared by multiple abilities.
