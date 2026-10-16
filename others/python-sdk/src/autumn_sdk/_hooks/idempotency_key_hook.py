import json
import uuid
from typing import Union

import httpx

from .types import BeforeRequestContext, BeforeRequestHook

IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"


def _is_write_check(operation_id: str, request: httpx.Request) -> bool:
    """A check that deducts, as sent on the wire: `send_event` or a lock."""
    if operation_id != "check":
        return False
    try:
        sent = json.loads(request.content or b"{}")
    except (ValueError, UnicodeDecodeError):
        return False
    return isinstance(sent, dict) and (sent.get("send_event") is True or sent.get("lock") is not None)


class IdempotencyKeyHook(BeforeRequestHook):
    """Under `use_edge`, a write check carries an Idempotency-Key: the caller's if set, else one made here once per call.
    Every retry and the edge's fallback resend that same key, so Autumn applies the write once."""

    def before_request(
        self, hook_ctx: BeforeRequestContext, request: httpx.Request
    ) -> Union[httpx.Request, Exception]:
        if not getattr(hook_ctx.config, "use_edge", False):
            return request
        if not _is_write_check(hook_ctx.operation_id, request):
            return request
        # Set on the call's own request, which every retry starts from, so they all send this key.
        request.headers.setdefault(IDEMPOTENCY_KEY_HEADER, str(uuid.uuid4()))
        return request
