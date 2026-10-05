/** One HTTP worker thread, booted: its rings, its lane on this thread, and how its death is reported. */
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../../threads/ring/createRing.js";
import { createRingSignal } from "../../../threads/ring/ringSignal.js";
import type { HttpWorkerLane } from "../types/httpWorkerLane.js";
import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import type {
	HttpWorkerInit,
	HttpWorkerMessage,
} from "../types/httpWorkerThread.js";
import { serveRequest } from "./dispatchRequests.js";
import { reportPoolFailure } from "./reportPoolFailure.js";

/** `ready` settles once the thread has bound the port, or rejects with why it could not. */
export function spawnHttpWorker({
	scope,
	index,
}: {
	scope: HttpWorkerPoolScope;
	index: number;
}): { lane: HttpWorkerLane; ready: Promise<void> } {
	const { config, state } = scope;
	const requestRing = createRing({ capacity: config.requestRingBytes });
	const replyRing = createRing({ capacity: config.replyRingBytes });
	const replySignal = createRingSignal();
	const thread = new Worker(new URL("../httpWorker.ts", import.meta.url).href, {
		name: `balance-worker-http-${index}`,
	});
	const ready = Promise.withResolvers<void>();
	const stopped = Promise.withResolvers<void>();
	const lane: HttpWorkerLane = {
		index,
		thread,
		requests: createRingReader({ ring: requestRing }),
		replies: createRingWriter({ ring: replyRing, signal: replySignal }),
		replySignal,
		outbox: [],
		pumping: false,
		dirty: false,
		stopped: stopped.promise,
	};
	let listening = false;
	function died(error: Error): void {
		stopped.resolve();
		if (!listening) ready.reject(error);
		else reportPoolFailure({ scope, cause: error });
	}
	thread.onmessage = function receive(event: MessageEvent<HttpWorkerMessage>) {
		const message = event.data;
		if (message.kind === "ready") {
			listening = true;
			ready.resolve();
		} else if (message.kind === "error")
			ready.reject(
				new Error(`HTTP worker ${index} could not listen: ${message.message}`),
			);
		else if (message.kind === "request")
			void serveRequest({ scope, lane, ...message });
		else stopped.resolve();
	};
	thread.onerror = function crashed(event) {
		died(new Error(`HTTP worker ${index} failed: ${event.message}`));
	};
	// A thread that exits on its own (uncaught error, process.exit) closes without being asked.
	thread.addEventListener("close", function closed(event) {
		if (state.stopping) {
			stopped.resolve();
			return;
		}
		died(
			new Error(
				`HTTP worker ${index} exited with code ${(event as CloseEvent).code}`,
			),
		);
	});
	const init: HttpWorkerInit = {
		index,
		hostname: config.hostname,
		port: config.port,
		maxRequestBodySize: config.maxRequestBodySize,
		requestRing,
		replyRing,
		requestSignal: state.requestSignal.sab,
		replySignal: replySignal.sab,
		latency: { routes: config.inline?.routes ?? [], cells: state.latencyCells },
		...(config.inline && {
			heldReplies: {
				commitCells: config.inline.commitCells,
				failureCounts: config.inline.failureCounts,
			},
		}),
	};
	thread.postMessage(init);
	return { lane, ready: ready.promise };
}
