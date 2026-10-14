import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { postToProducerThread } from "./postToProducerThread.js";
import { drainAcks } from "./receiveAcks.js";
import { failPendingAsUnknown } from "./reportProducerThreadFailure.js";

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
	}
	await scope.stopped.promise;
	state.stopping = true;
	drainAcks({ scope });
	failPendingAsUnknown({ scope, message: "Producer thread stopped" });
	state.thread.terminate();
}
