import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { postToProducerThread } from "./postToProducerThread.js";
import { drainAcks } from "./receiveAcks.js";
import { failPendingAsUnknown } from "./reportProducerThreadFailure.js";

/**
 * Waits for the thread to flush and disconnect its producers; a thread that already exited is not waited
 * for. Acks it wrote before `stopped` are read, and anything it never answered fails as unknown.
 */
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
	drainAcks({ scope });
	failPendingAsUnknown({ scope, message: "Producer thread stopped" });
	// Terminating a Worker that loaded the librdkafka addon crashes Bun on the next teardown; the idle thread ends with the process.
	const thread: Worker & { unref?(): void } = state.thread;
	thread.unref?.();
}
