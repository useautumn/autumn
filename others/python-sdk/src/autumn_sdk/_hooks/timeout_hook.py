from typing import Union

import httpx

from .types import BeforeRequestContext, BeforeRequestHook

DEFAULT_TIMEOUT_S = 5.0
AUTO_TIMEOUT_OPERATION_IDS = {"check", "track"}


class TimeoutHook(BeforeRequestHook):
    def before_request(
        self,
        hook_ctx: BeforeRequestContext,
        request: httpx.Request,
    ) -> Union[httpx.Request, Exception]:
        existing_timeout = request.extensions.get("timeout")

        needs_default = (
            hook_ctx.operation_id in AUTO_TIMEOUT_OPERATION_IDS
            and (existing_timeout is None or existing_timeout == httpx.USE_CLIENT_DEFAULT)
            and (hook_ctx.config.timeout_ms is None or hook_ctx.config.timeout_ms <= 0)
        )

        if needs_default:
            request.extensions["timeout"] = httpx.Timeout(DEFAULT_TIMEOUT_S).as_dict()

        return request
