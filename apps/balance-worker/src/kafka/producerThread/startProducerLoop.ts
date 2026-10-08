/**
 * The producer thread's loop: the producers live here, on their own thread. Send frames come off the
 * send ring (or by `postMessage` when they did not fit), each becomes one `producer.send`, and its outcome
 * goes back as an ack frame. Nothing here knows a record's meaning: it moves bytes and reports what the
 * broker said.
 */
import {
	createRingReader,
	createRingWriter,
} from "../../threads/ring/createRing.js";
import { createRingSignal } from "../../threads/ring/ringSignal.js";
import { dispatchSend, sendLoop } from "./loop/dispatchSends.js";
import {
	connectProducer,
	createProducer,
	disconnectProducer,
	stopProducers,
} from "./loop/producerLifecycle.js";
import type { ProducerLoopScope } from "./types/producerLoopScope.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
} from "./types/producerThreadMessages.js";

export type ProducerLoop = {
	receive(message: DecideToProducerMessage): void;
};

export function startProducerLoop({
	ctx,
	init,
}: {
	ctx: ProducerLoopScope["ctx"];
	init: ProducerThreadInit;
}): ProducerLoop {
	const scope: ProducerLoopScope = {
		ctx,
		sends: createRingReader({ ring: init.sendRing }),
		sendSignal: createRingSignal({ sab: init.sendSignal }),
		acks: createRingWriter({
			ring: init.ackRing,
			signal: createRingSignal({ sab: init.ackSignal }),
		}),
		producers: new Map(),
		nextSeq: new Map(),
		held: new Map(),
		ackQueue: [],
		inFlight: new Set(),
		state: {
			pumpingAcks: false,
			ackPump: Promise.resolve(),
			stopping: false,
		},
	};

	function receive(message: DecideToProducerMessage): void {
		if (message.kind === "create")
			createProducer({
				scope,
				producerId: message.producerId,
				config: message.config,
			});
		else if (message.kind === "connect")
			connectProducer({
				scope,
				producerId: message.producerId,
				reqId: message.reqId,
			});
		else if (message.kind === "disconnect")
			disconnectProducer({
				scope,
				producerId: message.producerId,
				reqId: message.reqId,
			});
		else if (message.kind === "send")
			dispatchSend({ scope, bytes: new Uint8Array(message.bytes) });
		else void stopProducers({ scope });
	}

	// A frame the loop cannot read ends it; the thread's uncaught rejection reaches the decide thread as its error.
	void sendLoop({ scope });
	return { receive };
}
