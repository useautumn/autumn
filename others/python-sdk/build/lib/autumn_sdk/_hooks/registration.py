from .fail_open_hook import FailOpenHook
from .timeout_hook import TimeoutHook
from .types import Hooks


# This file is only ever generated once on the first generation and then is free to be modified.
# Any hooks you wish to add should be registered in the init_hooks function. Feel free to define them
# in this file or in separate files in the hooks folder.


def init_hooks(hooks: Hooks):
    """Add hooks by calling hooks.register{sdk_init/before_request/after_success/after_error}Hook
    with an instance of a hook that implements that specific Hook interface
    Hooks are registered per SDK instance, and are valid for the lifetime of the SDK instance"""
    fail_open_hook = FailOpenHook()
    timeout_hook = TimeoutHook()

    hooks.register_sdk_init_hook(fail_open_hook)
    hooks.register_before_request_hook(timeout_hook)
    hooks.register_after_error_hook(fail_open_hook)
