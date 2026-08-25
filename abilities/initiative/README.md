# Initiative ability

Initiative is client-triggered. The Core keeps Qwen Omni Realtime's normal
`server_vad` turn detection, measures cumulative silence locally, and sends a
`response.create` client event when the selected Role's timeout is reached.

The timeout value and the instructions for what to say after a proactive turn
belong to the selected Role. This ability intentionally has no standalone
prompt: a Role supplies the behavior, while Core supplies the timer and the
trigger. Do not configure `idle_timeout_ms` for this ability.
