import { isMainThread } from "node:worker_threads";

/** Started as a thread, it fails as it is told to start, the way one whose files cannot open does. */
export const FAILING_THREAD = import.meta.path;

if (!isMainThread)
	self.onmessage = () => {
		throw new Error("injected thread start failure");
	};
