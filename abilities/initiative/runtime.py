"""Protocol contract for the Initiative ability."""


DEFAULT_TIMEOUT_SECONDS = 10
MIN_TIMEOUT_SECONDS = 5
MAX_TIMEOUT_SECONDS = 300


def clamp_timeout_seconds(value) -> int:
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        parsed = DEFAULT_TIMEOUT_SECONDS
    return max(MIN_TIMEOUT_SECONDS, min(MAX_TIMEOUT_SECONDS, parsed))
