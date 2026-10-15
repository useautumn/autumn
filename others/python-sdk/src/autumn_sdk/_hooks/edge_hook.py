import uuid
from typing import Optional, Union

import httpx

from autumn_sdk.sdkconfiguration import SDKConfiguration

from .edge_clients import EdgeAsyncClient, EdgeBases, EdgeSyncClient, rebase_request, rebase_url
from .edge_operations import edge_operation_at, is_keyed_write
from .types import BeforeRequestContext, BeforeRequestHook, SDKInitHook

IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"


def edge_bases_of(config: SDKConfiguration) -> Optional[EdgeBases]:
    """The client's Autumn API and edge bases, or None when it has no edge."""
    edge_url = getattr(config, "edge_url", None)
    if not edge_url:
        return None
    return EdgeBases(autumn=config.get_server_details()[0], edge=edge_url)


class EdgeHook(SDKInitHook, BeforeRequestHook):
    """With `use_edge` and an `edge_url`, sends each call the edge serves to the edge first (`client.edge` is the same
    client with `use_edge` on), a write under one idempotency key. The client's HTTP clients fall back to the Autumn API."""

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
        # Only a call bound for the client's Autumn API: a per-call `server_url` is the caller's choice.
        operation = edge_operation_at(request.url, bases.autumn)
        edge_url = rebase_url(request.url, bases.autumn, bases.edge)
        if operation is None or edge_url is None:
            return request
        if is_keyed_write(operation, request) and IDEMPOTENCY_KEY_HEADER not in request.headers:
            # Set on the call's own request, which every retry starts from, so they all send this key.
            request.headers[IDEMPOTENCY_KEY_HEADER] = str(uuid.uuid4())
        return rebase_request(request, edge_url)

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
