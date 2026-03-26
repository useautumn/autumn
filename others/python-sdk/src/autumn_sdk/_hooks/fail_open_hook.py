import json
import sys
from typing import Optional, Tuple, Union

import httpx

from autumn_sdk.sdkconfiguration import SDKConfiguration

from .types import (
    AfterErrorContext,
    AfterErrorHook,
    SDKInitHook,
)

FAIL_OPEN_OPERATION_IDS = {"check", "track", "getOrCreateCustomer"}

FAIL_OPEN_LOG_MESSAGE = (
    "[Autumn] Request failed \u2014 failing open. "
    "Learn more: https://docs.useautumn.com/documentation/fail-open"
)

FAIL_OPEN_BODIES: dict = {
    "check": {
        "allowed": True,
        "customer_id": None,
        "balance": None,
        "flag": None,
    },
    "track": {
        "customer_id": None,
        "value": 0,
        "balance": None,
    },
    "getOrCreateCustomer": {
        "id": None,
        "name": None,
        "email": None,
        "created_at": 0,
        "fingerprint": None,
        "stripe_id": None,
        "env": "live",
        "metadata": {},
        "send_email_receipts": False,
        "billing_controls": {},
        "subscriptions": [],
        "purchases": [],
        "balances": {},
        "flags": {},
    },
}


def _make_synthetic_response(status_code: int, body: Optional[dict] = None) -> httpx.Response:
    content = json.dumps(body).encode() if body else b""
    headers = {"content-type": "application/json"} if body else {}
    return httpx.Response(
        status_code=status_code,
        headers=headers,
        content=content,
    )


class _SafeSyncClient:
    """Wraps an httpx sync client to catch connection/timeout errors and return a 503."""

    def __init__(self, inner: httpx.Client):
        self._inner = inner

    def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        try:
            return self._inner.send(request, **kwargs)
        except (httpx.ConnectError, httpx.TimeoutException):
            return _make_synthetic_response(503)

    def build_request(self, *args, **kwargs) -> httpx.Request:
        return self._inner.build_request(*args, **kwargs)

    def close(self) -> None:
        self._inner.close()

    def __getattr__(self, name):
        return getattr(self._inner, name)


class _SafeAsyncClient:
    """Wraps an httpx async client to catch connection/timeout errors and return a 503."""

    def __init__(self, inner: httpx.AsyncClient):
        self._inner = inner

    async def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        try:
            return await self._inner.send(request, **kwargs)
        except (httpx.ConnectError, httpx.TimeoutException):
            return _make_synthetic_response(503)

    def build_request(self, *args, **kwargs) -> httpx.Request:
        return self._inner.build_request(*args, **kwargs)

    async def aclose(self) -> None:
        await self._inner.aclose()

    def __getattr__(self, name):
        return getattr(self._inner, name)


class FailOpenHook(SDKInitHook, AfterErrorHook):
    def __init__(self):
        self._enabled = True

    def sdk_init(self, config: SDKConfiguration) -> SDKConfiguration:
        if config.globals.fail_open is False:
            self._enabled = False
            return config

        self._enabled = True

        if config.client is not None and not isinstance(config.client, _SafeSyncClient):
            config.client = _SafeSyncClient(config.client)

        if config.async_client is not None and not isinstance(config.async_client, _SafeAsyncClient):
            config.async_client = _SafeAsyncClient(config.async_client)

        return config

    def after_error(
        self,
        hook_ctx: AfterErrorContext,
        response: Optional[httpx.Response],
        error: Optional[Exception],
    ) -> Union[Tuple[Optional[httpx.Response], Optional[Exception]], Exception]:
        if not self._enabled:
            return response, error

        if response is None or response.status_code < 500:
            return response, error

        if hook_ctx.operation_id not in FAIL_OPEN_OPERATION_IDS:
            return response, error

        body = FAIL_OPEN_BODIES.get(hook_ctx.operation_id)
        if body is None:
            return response, error

        print(FAIL_OPEN_LOG_MESSAGE, file=sys.stderr)
        print(
            f"  Operation: {hook_ctx.operation_id} | "
            f"Status: {response.status_code} | "
            f"Error: {error or 'Server error'}",
            file=sys.stderr,
        )

        return _make_synthetic_response(200, body), None
