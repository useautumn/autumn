import json
from typing import Callable, Dict, Optional, Union

import httpx

from autumn_sdk.sdkconfiguration import SDKConfiguration

from .edge_clients import EdgeAsyncClient, EdgeBases, EdgeSyncClient, rebase_request, rebase_url
from .types import BeforeRequestContext, BeforeRequestHook, SDKInitHook

# What the edge serves, by operation id. A write never goes there, so a fallback can't make it land twice.
EDGE_OPERATIONS: Dict[str, Optional[Callable[[dict], bool]]] = {
    "check": lambda body: body.get("send_event") is True or body.get("lock") is not None,
}


def _body_of(request: httpx.Request) -> dict:
    try:
        body = json.loads(request.content or b"{}")
    except (ValueError, UnicodeDecodeError):
        return {}
    return body if isinstance(body, dict) else {}


def is_edge_operation(operation_id: str, request: httpx.Request) -> bool:
    """Whether this call is one the edge answers: a listed operation, and not a write."""
    if operation_id not in EDGE_OPERATIONS:
        return False
    is_write = EDGE_OPERATIONS[operation_id]
    return is_write is None or not is_write(_body_of(request))


def edge_bases_of(config: SDKConfiguration) -> Optional[EdgeBases]:
    """The client's Autumn API and edge bases, or None when it has no edge."""
    edge_url = getattr(config, "edge_url", None)
    if not edge_url:
        return None
    return EdgeBases(autumn=config.get_server_details()[0], edge=edge_url)


class EdgeHook(SDKInitHook, BeforeRequestHook):
    """With `use_edge` and an `edge_url`, sends each call the edge serves to the edge first (`client.edge` is the same
    client with `use_edge` on). The client's HTTP clients fall back to the Autumn API when the edge is down."""

    def sdk_init(self, config: SDKConfiguration) -> SDKConfiguration:
        bases = edge_bases_of(config)
        if bases is None:
            return config
        if config.client is not None and not isinstance(config.client, EdgeSyncClient):
            config.client = EdgeSyncClient(config.client, bases)
        if config.async_client is not None and not isinstance(config.async_client, EdgeAsyncClient):
            config.async_client = EdgeAsyncClient(config.async_client, bases)
        return config

    def before_request(
        self, hook_ctx: BeforeRequestContext, request: httpx.Request
    ) -> Union[httpx.Request, Exception]:
        bases = edge_bases_of(hook_ctx.config)
        if bases is None or not getattr(hook_ctx.config, "use_edge", False):
            return request
        if not is_edge_operation(hook_ctx.operation_id, request):
            return request
        # Only a call bound for the client's Autumn API: a per-call `server_url` is the caller's choice.
        edge_url = rebase_url(request.url, bases.autumn, bases.edge)
        return request if edge_url is None else rebase_request(request, edge_url)


def edge_client_of(sdk):
    """`sdk` with `use_edge` on, sharing its configuration, HTTP clients and hooks."""
    # pylint: disable=import-outside-toplevel
    import copy

    from autumn_sdk.basesdk import BaseSDK

    cached = sdk.__dict__.get("_edge")
    if cached is not None:
        return cached
    config = copy.copy(sdk.sdk_configuration)
    config.use_edge = True
    edge = sdk.__class__.__new__(sdk.__class__)
    BaseSDK.__init__(edge, config, parent_ref=sdk)
    sdk.__dict__["_edge"] = edge
    return edge
