import type { KafkaProducerClient, KafkaProducerFactory } from "@autumn/kafka";
import type {
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { ProducerToDecideMessage } from "./producerThreadMessages.js";

export type ProducerLoopScope = {
	ctx: {
		kafka: KafkaProducerFactory;
		post(message: ProducerToDecideMessage): void;
	};
	sends: RingReader;
	sendSignal: RingSignal;
	acks: RingWriter;
	producers: Map<number, KafkaProducerClient>;
	nextSeq: Map<number, number>;
	held: Map<number, Map<number, Uint8Array>>;
	ackQueue: Uint8Array[];
	inFlight: Set<Promise<void>>;
	state: {
		pumpingAcks: boolean;
		ackPump: Promise<void>;
		stopping: boolean;
	};
};
