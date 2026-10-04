import type { KafkaProducerClient, KafkaProducerFactory } from "@autumn/kafka";
import type {
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { ProducerToDecideMessage } from "./producerThreadMessages.js";

/** What the producer loop's steps share: the client, the rings, and each producer's state. */
export type ProducerLoopScope = {
	ctx: {
		kafka: KafkaProducerFactory;
		post(message: ProducerToDecideMessage): void;
	};
	sends: RingReader;
	sendSignal: RingSignal;
	acks: RingWriter;
	producers: Map<number, KafkaProducerClient>;
	/** A frame that took the message port can overtake the ring; sends go out in each producer's own order. */
	nextSeq: Map<number, number>;
	/** Frames that arrived ahead of their turn, by producer and sequence number. */
	held: Map<number, Map<number, Uint8Array>>;
	/** Encoded acks waiting for room on the ack ring, in the order their sends settled. */
	ackQueue: Uint8Array[];
	state: { pumpingAcks: boolean; stopping: boolean };
};
