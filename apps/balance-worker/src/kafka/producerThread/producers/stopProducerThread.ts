import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { postToProducerThread } from "./postToProducerThread.js";

/** Waits for the thread to disconnect its producers; a thread that already exited is not waited for. */
export async function stopProducerThread({
	scope,
}: {
	scope: ThreadedProducersScope;
}): Promise<void> {
	const { state } = scope;
	if (!state.thread || state.stopping) return;
	try {
		postToProducerThread({ scope, message: { kind: "stop" } });
	} catch {
		// Already gone: its `close` has settled `stopped`.
	}
	await scope.stopped.promise;
	state.stopping = true;
	state.thread.terminate();
}
