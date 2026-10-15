from .edge_hook import EdgeHook
from .fail_open_hook import FailOpenHook
from .idempotency_key_hook import IdempotencyKeyHook
from .timeout_hook import TimeoutHook
from .types import Hooks


# This file is only ever generated once on the first generation and then is free to be modified.
# Any hooks you wish to add should be registered in the init_hooks function. Feel free to define them
# in this file or in separate files in the hooks folder.


def init_hooks(hooks: Hooks):
    """Every way this SDK patches the generated client, one hook each; README.md in this folder lists them."""
    fail_open_hook = FailOpenHook()
    edge_hook = EdgeHook()

    # Fail-open first: it replaces the HTTP clients, and the edge clients wrap whatever is there.
    hooks.register_sdk_init_hook(fail_open_hook)
    hooks.register_sdk_init_hook(edge_hook)

    # The key hook before the edge hook: retries start from the original request, which the edge hook copies.
    hooks.register_before_request_hook(IdempotencyKeyHook())
    hooks.register_before_request_hook(edge_hook)
    hooks.register_before_request_hook(TimeoutHook())

    hooks.register_after_error_hook(fail_open_hook)
