import type { KafkaProducerFactory } from "@autumn/kafka";
import type { ProducerThreadInit } from "./producerThreadMessages.js";

export type ThreadedProducersConfig = Pick<
	ProducerThreadInit,
	"clientId" | "brokers" | "authMode" | "region" | "limits"
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

/** kafkajs's `producer.network.request` payload, the part `kafkaRequestTimings` reads. */
export type RequestPayload = {
	apiName: string;
	broker: string;
	duration: number;
	pendingDuration: number;
};
export type RequestListener = (event: { payload: RequestPayload }) => void;
