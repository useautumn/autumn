/**
 * The decide thread's handle on the producer thread: a `kafka.producer(config)` factory whose producers live
 * on that thread. A send is one send frame on the send ring (or a `postMessage` when it does not fit), its
 * outcome one ack frame back; connect and disconnect are control messages.
 */
import type { KafkaProducerClient } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../threads/ring/createRing.js";
import { createRingSignal } from "../../threads/ring/ringSignal.js";
import { createThreadProducer } from "./producers/createThreadProducer.js";
import { startProducerThread } from "./producers/startProducerThread.js";
import { stopProducerThread } from "./producers/stopProducerThread.js";
import type {
	ThreadedProducers,
	ThreadedProducersConfig,
} from "./types/threadedProducers.js";
import type { ThreadedProducersScope } from "./types/threadedProducersScope.js";

export type {
	ThreadedProducers,
	ThreadedProducersConfig,
} from "./types/threadedProducers.js";

export function createThreadedProducers({
	ctx,
	config,
}: {
	ctx: ThreadedProducersScope["ctx"];
	config: ThreadedProducersConfig;
}): ThreadedProducers {
	const rings = {
		send: createRing({ capacity: config.sendRingBytes }),
		ack: createRing({ capacity: config.ackRingBytes }),
		sendSignal: createRingSignal(),
		ackSignal: createRingSignal(),
	};
	const scope: ThreadedProducersScope = {
		ctx,
		config,
		rings,
		sends: createRingWriter({ ring: rings.send, signal: rings.sendSignal }),
		acks: createRingReader({ ring: rings.ack }),
		pending: new Map(),
		requestListeners: new Map(),
		stopped: Promise.withResolvers<void>(),
		state: {
			thread: null,
			nextReqId: 1,
			nextProducerId: 1,
			stopping: false,
			failed: false,
			sendsOverPort: 0,
		},
	};

	function start(): Promise<void> {
		return startProducerThread({ scope });
	}

	function stop(): Promise<void> {
		return stopProducerThread({ scope });
	}

	function producer(producerConfig: ProducerConfig): KafkaProducerClient {
		return createThreadProducer({ scope, producerConfig });
	}

	function drainHealth() {
		const sendsOverPort = scope.state.sendsOverPort;
		scope.state.sendsOverPort = 0;
		return { sendsAwaitingAck: scope.pending.size, sendsOverPort };
	}

	return { start, stop, producer, drainHealth };
}
