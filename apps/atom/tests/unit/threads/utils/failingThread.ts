import { isMainThread } from "node:worker_threads";

export const FAILING_THREAD = import.meta.path;

if (!isMainThread)
	self.onmessage = () => {
		throw new Error("injected thread start failure");
	};
