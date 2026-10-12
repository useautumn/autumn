import time
from typing import Dict, Optional, Union

import httpx

from autumn_sdk.httpclient import AsyncHttpClient, HttpClient

# Set on every reply the Autumn API gave through the edge, its errors included: that call may already have landed.
FORWARDED_HEADER = "x-atom-forwarded"

# The edge answers in milliseconds; past this, the call's remaining time goes to the Autumn API.
EDGE_TIMEOUT_S = 1.0


class EdgeBases:
    """The client's Autumn API and edge bases, each ending in one slash."""

    def __init__(self, autumn: str, edge: str):
        self.autumn = autumn.rstrip("/") + "/"
        self.edge = edge.rstrip("/") + "/"


def rebase_url(url: Union[str, httpx.URL], from_base: str, to_base: str) -> Optional[str]:
    """`url` under `from_base`, moved to the same path under `to_base`; None when it isn't under `from_base`."""
    href = str(url)
    if not (href.rstrip("/") + "/").startswith(from_base):
        return None
    return to_base + href[len(from_base):]


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

    def __init__(self, request: httpx.Request, bases: EdgeBases):
        self.autumn_url = rebase_url(request.url, bases.edge, bases.autumn)
        self._request = request
        self._timeout = _timeout_of(request)
        self._started_at = time.monotonic()

    def edge(self) -> httpx.Request:
        return rebase_request(self._request, str(self._request.url), _capped(self._timeout, EDGE_TIMEOUT_S))

    def fallback(self) -> Optional[httpx.Request]:
        remaining = _remaining(self._timeout, time.monotonic() - self._started_at)
        if self.autumn_url is None or remaining is None:
            return None
        return rebase_request(self._request, self.autumn_url, remaining)


class EdgeSyncClient:
    """Sends calls addressed to the edge edge-first, falling back to the Autumn API when it's down."""

    def __init__(self, inner: HttpClient, bases: EdgeBases):
        self._inner = inner
        self._bases = bases

    def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        legs = _EdgeLegs(request, self._bases)
        if legs.autumn_url is None:
            return self._inner.send(request, **kwargs)
        try:
            reply = self._inner.send(legs.edge(), **kwargs)
        except httpx.TransportError:
            fallback = legs.fallback()
            if fallback is None:
                raise
            return self._inner.send(fallback, **kwargs)
        fallback = legs.fallback() if is_edge_down(reply) else None
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
        legs = _EdgeLegs(request, self._bases)
        if legs.autumn_url is None:
            return await self._inner.send(request, **kwargs)
        try:
            reply = await self._inner.send(legs.edge(), **kwargs)
        except httpx.TransportError:
            fallback = legs.fallback()
            if fallback is None:
                raise
            return await self._inner.send(fallback, **kwargs)
        fallback = legs.fallback() if is_edge_down(reply) else None
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

