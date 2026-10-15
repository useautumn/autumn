import json
from dataclasses import dataclass
from typing import Callable, Dict, Literal, Optional, Union

import httpx

# When a call the edge didn't answer goes to the Autumn API. "edge_down": after any edge failure, safe for a read and for
# a keyed write, which Autumn dedupes. "edge_never_got_it": only once the edge provably never received it.
EdgeFallback = Literal["edge_down", "edge_never_got_it"]


def _never_keyed(_body: dict) -> bool:
    return False


@dataclass(frozen=True)
class EdgeOperation:
    fallback: EdgeFallback
    # A write sent under one idempotency key, made once per call when the caller set none.
    is_keyed_write: Callable[[dict], bool] = _never_keyed


# What the edge serves, by path under the API base. Track never goes there.
EDGE_OPERATIONS: Dict[str, EdgeOperation] = {
    "v1/balances.check": EdgeOperation(
        "edge_down", lambda body: body.get("send_event") is True or body.get("lock") is not None
    ),
    # The edge holds no key for a finalize, so Autumn can't dedupe one it settled.
    "v1/balances.finalize": EdgeOperation("edge_never_got_it"),
}


def path_under(url: Union[str, httpx.URL], base: str) -> Optional[str]:
    """`url`'s path and query under `base`; None when it isn't under `base`."""
    href = str(url)
    if not (href.rstrip("/") + "/").startswith(base):
        return None
    return href[len(base):]


def edge_operation_at(url: Union[str, httpx.URL], base: str) -> Optional[EdgeOperation]:
    """The operation the edge serves at `url` under `base`, or None for any other call."""
    path = path_under(url, base)
    return None if path is None else EDGE_OPERATIONS.get(path.split("?")[0])


def _body_of(request: httpx.Request) -> dict:
    try:
        body = json.loads(request.content or b"{}")
    except (ValueError, UnicodeDecodeError):
        return {}
    return body if isinstance(body, dict) else {}


def is_keyed_write(operation: EdgeOperation, request: httpx.Request) -> bool:
    return operation.is_keyed_write(_body_of(request))
