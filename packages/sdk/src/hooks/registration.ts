import { BufferLoggedResponseHook } from "./bufferLoggedResponseHook.js";
import { EdgeHook } from "./edge/edgeHook.js";
import { FailOpenHook } from "./failOpenHook.js";
import { RedactDebugLogHook } from "./redactDebugLogHook.js";
import { TimeoutFixHook } from "./timeoutFixHook.js";
import type { Hooks } from "./types.js";

/*
 * This file is only ever generated once on the first generation and then is free to be modified.
 * Any hooks you wish to add should be registered in the initHooks function. Feel free to define them
 * in this file or in separate files in the hooks folder.
 */

export function initHooks(hooks: Hooks) {
	const failOpenHook = new FailOpenHook();
	const timeoutFixHook = new TimeoutFixHook();
	hooks.registerSDKInitHook(failOpenHook);
	hooks.registerSDKInitHook(new RedactDebugLogHook());
	// After fail-open, which replaces the HTTP client the edge one wraps.
	const edgeHook = new EdgeHook();
	hooks.registerSDKInitHook(edgeHook);
	hooks.registerBeforeCreateRequestHook(edgeHook);
	hooks.registerBeforeCreateRequestHook(timeoutFixHook);
	hooks.registerAfterSuccessHook(new BufferLoggedResponseHook());
	hooks.registerAfterErrorHook(failOpenHook);
}
