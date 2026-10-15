import time
from typing import Dict, Optional, Union

import httpx

from autumn_sdk.httpclient import AsyncHttpClient, HttpClient

from .edge_operations import EdgeOperation, edge_operation_at, path_under
from .fail_open_hook import network_error_of

# Set on every reply the Autumn API gave through the edge, its errors included: that call may already have landed.
FORWARDED_HEADER = "x-atom-forwarded"

# The edge answers in milliseconds; past this, a call that falls back when the edge is down spends the rest on the API.
EDGE_TIMEOUT_S = 1.0


class EdgeBases:
    """The client's Autumn API and edge bases, each ending in one slash."""

    def __init__(self, autumn: str, edge: str):
        self.autumn = autumn.rstrip("/") + "/"
        self.edge = edge.rstrip("/") + "/"


def rebase_url(url: Union[str, httpx.URL], from_base: str, to_base: str) -> Optional[str]:
    """`url` under `from_base`, moved to the same path under `to_base`; None when it isn't under `from_base`."""
    path = path_under(url, from_base)
    return None if path is None else to_base + path


def rebase_request(
    request: httpx.Request, url: str, timeout: Optional[Dict[str, Optional[float]]] = None
) -> httpx.Request:
    """`request` sent to `url`, with `timeout` when given; the Host header follows the new URL."""
    headers = [(name, value) for name, value in request.headers.items() if name.lower() != "host"]
    extensions = dict(request.extensions)
    if timeout is not None:
        extensions["timeout"] = timeout
    return httpx.Request(
        request.method, url, headers=headers, content=request.content, extensions=extensions
    )


def is_edge_down(response: httpx.Response) -> bool:
    """A 5xx the edge answered itself, or fail-open's 503 for no reply: the Autumn API never saw the call."""
    return response.status_code >= 500 and FORWARDED_HEADER not in response.headers


def is_unserved_route(response: httpx.Response) -> bool:
    """The edge's own 404: it serves no such route yet. A forwarded one is the API's answer."""
    return response.status_code == 404 and FORWARDED_HEADER not in response.headers


def _failed_before_sending(error: Optional[Exception]) -> bool:
    # httpx raises ConnectError only while connecting (refused, unresolved, TLS), before any of the request is sent.
    return isinstance(error, httpx.ConnectError)


def _timeout_of(request: httpx.Request) -> Dict[str, Optional[float]]:
    timeout = request.extensions.get("timeout")
    return dict(timeout) if isinstance(timeout, dict) else httpx.Timeout(5.0).as_dict()


def _capped(timeout: Dict[str, Optional[float]], cap: float) -> Dict[str, Optional[float]]:
    return {phase: cap if seconds is None else min(seconds, cap) for phase, seconds in timeout.items()}


def _remaining(
    timeout: Dict[str, Optional[float]], elapsed: float
) -> Optional[Dict[str, Optional[float]]]:
    """The call's timeout less the time the edge took; None once it's spent."""
    left = {phase: None if seconds is None else seconds - elapsed for phase, seconds in timeout.items()}
    if any(seconds is not None and seconds <= 0 for seconds in left.values()):
        return None
    return left


class _EdgeLegs:
    """The edge leg of a call, and its fallback to the Autumn API with the call's remaining time."""

    @staticmethod
    def of(request: httpx.Request, bases: EdgeBases) -> Optional["_EdgeLegs"]:
        """The legs of a call the edge serves; None for any other call."""
        operation = edge_operation_at(request.url, bases.edge)
        autumn_url = rebase_url(request.url, bases.edge, bases.autumn)
        if operation is None or autumn_url is None:
            return None
        return _EdgeLegs(request, operation, autumn_url)

    def __init__(self, request: httpx.Request, operation: EdgeOperation, autumn_url: str):
        self._operation = operation
        self._autumn_url = autumn_url
        self._request = request
        self._timeout = _timeout_of(request)
        self._started_at = time.monotonic()

    def edge(self) -> httpx.Request:
        if self._operation.fallback == "edge_never_got_it":
            # It can't fall back after a timeout, so the edge gets all of the call's time.
            return self._request
        return rebase_request(self._request, str(self._request.url), _capped(self._timeout, EDGE_TIMEOUT_S))

    def _falls_back(self, reply: Optional[httpx.Response], error: Optional[Exception]) -> bool:
        if self._operation.fallback == "edge_down":
            return reply is None or is_edge_down(reply)
        if reply is None:
            return _failed_before_sending(error)
        return is_unserved_route(reply) or _failed_before_sending(network_error_of(reply))

    def fallback(
        self, reply: Optional[httpx.Response] = None, error: Optional[Exception] = None
    ) -> Optional[httpx.Request]:
        """The call sent on to the Autumn API, or None when its fallback rule or its time says no."""
        remaining = _remaining(self._timeout, time.monotonic() - self._started_at)
        if remaining is None or not self._falls_back(reply, error):
            return None
        return rebase_request(self._request, self._autumn_url, remaining)


class EdgeSyncClient:
    """Sends calls addressed to the edge edge-first, falling back to the Autumn API as each operation's rule allows."""

    def __init__(self, inner: HttpClient, bases: EdgeBases):
        self._inner = inner
        self._bases = bases

    def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        legs = _EdgeLegs.of(request, self._bases)
        if legs is None:
            return self._inner.send(request, **kwargs)
        try:
            reply = self._inner.send(legs.edge(), **kwargs)
        except httpx.TransportError as error:
            fallback = legs.fallback(error=error)
            if fallback is None:
                raise
            return self._inner.send(fallback, **kwargs)
        fallback = legs.fallback(reply=reply)
        if fallback is None:
            return reply
        reply.close()
        return self._inner.send(fallback, **kwargs)

    def build_request(self, *args, **kwargs) -> httpx.Request:
        return self._inner.build_request(*args, **kwargs)

    def close(self) -> None:
        self._inner.close()

    def __getattr__(self, name):
        return getattr(self._inner, name)


class EdgeAsyncClient:
    """The async twin of `EdgeSyncClient`."""

    def __init__(self, inner: AsyncHttpClient, bases: EdgeBases):
        self._inner = inner
        self._bases = bases

    async def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        legs = _EdgeLegs.of(request, self._bases)
        if legs is None:
            return await self._inner.send(request, **kwargs)
        try:
            reply = await self._inner.send(legs.edge(), **kwargs)
        except httpx.TransportError as error:
            fallback = legs.fallback(error=error)
            if fallback is None:
                raise
            return await self._inner.send(fallback, **kwargs)
        fallback = legs.fallback(reply=reply)
        if fallback is None:
            return reply
        await reply.aclose()
        return await self._inner.send(fallback, **kwargs)

    def build_request(self, *args, **kwargs) -> httpx.Request:
        return self._inner.build_request(*args, **kwargs)

    async def aclose(self) -> None:
        await self._inner.aclose()

    def __getattr__(self, name):
        return getattr(self._inner, name)

