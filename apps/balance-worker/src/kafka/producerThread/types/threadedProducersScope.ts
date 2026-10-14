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

export type ThreadedProducersScope = {
	ctx: {
		logger: Pick<AutumnLogger, "warn" | "error">;
		onFatal(failure: { cause: unknown }): void;
		onToken?(info: KafkaTokenInfo): void;
	};
	config: ThreadedProducersConfig;
	rings: {
		send: Ring;
		ack: Ring;
		sendSignal: RingSignal;
		ackSignal: RingSignal;
	};
	sends: RingWriter;
	acks: RingReader;
	pending: Map<number, (ack: SendAck) => void>;
	requestListeners: Map<number, Set<RequestListener>>;
	stopped: ReturnType<typeof Promise.withResolvers<void>>;
	state: {
		thread: Worker | null;
		nextReqId: number;
		nextProducerId: number;
		stopping: boolean;
		failed: boolean;
		sendsOverPort: number;
	};
};
