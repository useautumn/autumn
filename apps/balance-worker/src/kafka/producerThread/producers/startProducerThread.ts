/** Boots the producer thread: its client is built there, and `ready` settles once it can take producers. */
import type { KafkaTokenInfo } from "@autumn/kafka";
import type {
	ProducerThreadInit,
	ProducerToDecideMessage,
} from "../types/producerThreadMessages.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { settleAck, startAckLoop } from "./receiveAcks.js";
import { reportProducerThreadFailure } from "./reportProducerThreadFailure.js";

function receive({
	scope,
	message,
}: {
	scope: ThreadedProducersScope;
	message: ProducerToDecideMessage;
}): void {
	if (message.kind === "done")
		settleAck({ scope, reqId: message.reqId, ack: { ok: true, metadata: [] } });
	else if (message.kind === "failed")
		settleAck({
			scope,
			reqId: message.reqId,
			ack: { ok: false, error: message.error },
		});
	else if (message.kind === "request") {
		const { event } = message;
		const payload = {
			apiName: event.apiName,
			broker: event.broker,
			duration: event.durationMs,
			pendingDuration: event.pendingMs,
		};
		for (const listener of scope.requestListeners.get(event.producerId) ?? [])
			listener({ payload });
	} else if (message.kind === "token")
		scope.ctx.onToken?.(message.info as KafkaTokenInfo);
	else if (message.kind === "stopped") scope.stopped.resolve();
}

export async function startProducerThread({
	scope,
}: {
	scope: ThreadedProducersScope;
}): Promise<void> {
	const { config, rings, state } = scope;
	if (state.thread) throw new Error("Threaded producers were already started");
	const url =
		config.threadUrl ?? new URL("../producerThread.ts", import.meta.url).href;
	const thread = new Worker(url, { name: "balance-worker-producers" });
	state.thread = thread;
	const ready = Promise.withResolvers<void>();
	let listening = false;
	function died(error: Error): void {
		scope.stopped.resolve();
		if (!listening) ready.reject(error);
		else reportProducerThreadFailure({ scope, cause: error });
	}
	thread.onmessage = function receiveFirst(
		event: MessageEvent<ProducerToDecideMessage>,
	) {
		const message = event.data;
		if (message.kind === "ready") {
			listening = true;
			thread.onmessage = function receiveNext(
				next: MessageEvent<ProducerToDecideMessage>,
			) {
				receive({ scope, message: next.data });
			};
			ready.resolve();
		} else if (message.kind === "error")
			ready.reject(
				new Error(`Producer thread could not start: ${message.message}`),
			);
	};
	thread.onerror = function crashed(event) {
		died(new Error(`Producer thread failed: ${event.message}`));
	};
	// A thread that exits on its own (uncaught error, process.exit) closes without being asked.
	thread.addEventListener("close", function closed(event) {
		if (state.stopping) {
			scope.stopped.resolve();
			return;
		}
		died(
			new Error(
				`Producer thread exited with code ${(event as CloseEvent).code}`,
			),
		);
	});
	const init: ProducerThreadInit = {
		clientId: config.clientId,
		brokers: config.brokers,
		authMode: config.authMode,
		region: config.region,
		scram: config.scram,
		limits: config.limits,
		sendRing: rings.send,
		ackRing: rings.ack,
		sendSignal: rings.sendSignal.sab,
		ackSignal: rings.ackSignal.sab,
	};
	thread.postMessage(init);
	try {
		await ready.promise;
	} catch (cause) {
		state.stopping = true;
		thread.terminate();
		throw cause;
	}
	startAckLoop({ scope });
}
