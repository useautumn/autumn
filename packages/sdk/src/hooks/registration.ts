import { FailOpenHook } from "./failOpenHook.js";
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
	hooks.registerBeforeRequestHook(timeoutFixHook);
	hooks.registerAfterErrorHook(failOpenHook);
}
