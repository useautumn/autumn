import type { KafkaTokenInfo } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type {
	Ring,
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { SendAck } from "../frames/ackFrame.js";
import type {
	RequestListener,
	ThreadedProducersConfig,
} from "./threadedProducers.js";

/** What the threaded producers' steps share: their dependencies, the rings, and the state of the thread. */
export type ThreadedProducersScope = {
	ctx: {
		logger: Pick<AutumnLogger, "warn" | "error">;
		/** The thread died or a ring broke: nothing in flight can be trusted, so the task is replaced. */
		onFatal(failure: { cause: unknown }): void;
		onToken?(info: KafkaTokenInfo): void;
	};
	config: ThreadedProducersConfig;
	rings: {
		send: Ring;
		ack: Ring;
		/** The decide thread wakes it on publish; the producer thread sleeps on it. */
		sendSignal: RingSignal;
		/** The producer thread wakes it on publish; the ack loop sleeps on it. */
		ackSignal: RingSignal;
	};
	sends: RingWriter;
	acks: RingReader;
	/** Every request awaiting its ack, by request id. */
	pending: Map<number, (ack: SendAck) => void>;
	requestListeners: Map<number, Set<RequestListener>>;
	/** Settles when the thread has disconnected its producers or exited. */
	stopped: ReturnType<typeof Promise.withResolvers<void>>;
	state: {
		thread: Worker | null;
		nextReqId: number;
		nextProducerId: number;
		stopping: boolean;
		failed: boolean;
		/** Sends too big for the ring, or that found it full, this window: they went by message port. */
		sendsOverPort: number;
	};
};
