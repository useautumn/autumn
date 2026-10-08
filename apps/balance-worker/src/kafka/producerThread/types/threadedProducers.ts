import type { KafkaProducerFactory, KafkaRequestTiming } from "@autumn/kafka";
import type { ProducerThreadInit } from "./producerThreadMessages.js";

export type ThreadedProducersConfig = Pick<
	ProducerThreadInit,
	"clientId" | "brokers" | "authMode" | "sasl" | "limits"
> & {
	/** Powers of two. */
	sendRingBytes: number;
	ackRingBytes: number;
	/** The thread module; tests point it at one that fakes the broker. */
	threadUrl?: string;
};

export type ThreadedProducers = KafkaProducerFactory & {
	/** Resolves once the thread has built its client; producers can only be created after this. */
	start(): Promise<void>;
	/** Disconnects every producer still open and ends the thread. */
	stop(): Promise<void>;
	/** `sendsAwaitingAck` is a gauge; `sendsOverPort` is the window's count, reset by the read. */
	drainHealth(): { sendsAwaitingAck: number; sendsOverPort: number };
};

export type RequestListener = (timing: KafkaRequestTiming) => void;
