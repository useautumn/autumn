import type { DecideToProducerMessage } from "../types/producerThreadMessages.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";

export function postToProducerThread({
	scope,
	message,
	transfer = [],
}: {
	scope: ThreadedProducersScope;
	message: DecideToProducerMessage;
	transfer?: ArrayBuffer[];
}): void {
	if (!scope.state.thread)
		throw new Error("Threaded producers are not started");
	scope.state.thread.postMessage(message, transfer);
}
