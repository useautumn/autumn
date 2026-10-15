import { BufferLoggedResponseHook } from "./bufferLoggedResponseHook.js";
import { EdgeHook } from "./edge/edgeHook.js";
import { FailOpenHook } from "./failOpenHook.js";
import { IdempotencyKeyHook } from "./idempotencyKeyHook.js";
import { RedactDebugLogHook } from "./redactDebugLogHook.js";
import { TimeoutFixHook } from "./timeoutFixHook.js";
import type { Hooks } from "./types.js";

/*
 * This file is only ever generated once on the first generation and then is free to be modified.
 * Any hooks you wish to add should be registered in the initHooks function. Feel free to define them
 * in this file or in separate files in the hooks folder.
 */

/** Every way this SDK patches the generated client, one hook each; README.md in this folder lists them. */
export function initHooks(hooks: Hooks) {
	const failOpenHook = new FailOpenHook();
	const edgeHook = new EdgeHook();

	// Fail-open first: it replaces the HTTP client, and the edge client wraps whatever is there.
	hooks.registerSDKInitHook(failOpenHook);
	hooks.registerSDKInitHook(new RedactDebugLogHook());
	hooks.registerSDKInitHook(edgeHook);

	hooks.registerBeforeCreateRequestHook(new IdempotencyKeyHook());
	hooks.registerBeforeCreateRequestHook(edgeHook);
	hooks.registerBeforeCreateRequestHook(new TimeoutFixHook());

	hooks.registerAfterSuccessHook(new BufferLoggedResponseHook());
	hooks.registerAfterErrorHook(failOpenHook);
}
