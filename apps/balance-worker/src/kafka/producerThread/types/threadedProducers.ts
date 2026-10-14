import type { KafkaProducerFactory } from "@autumn/kafka";
import type { ProducerThreadInit } from "./producerThreadMessages.js";

export type ThreadedProducersConfig = Pick<
	ProducerThreadInit,
	"clientId" | "brokers" | "authMode" | "region" | "sasl" | "limits"
> & {
	sendRingBytes: number;
	ackRingBytes: number;
	threadUrl?: string;
};

export type ThreadedProducers = KafkaProducerFactory & {
	start(): Promise<void>;
	stop(): Promise<void>;
	drainHealth(): { sendsAwaitingAck: number; sendsOverPort: number };
};

export type RequestPayload = {
	apiName: string;
	broker: string;
	duration: number;
	pendingDuration: number;
};
export type RequestListener = (event: { payload: RequestPayload }) => void;
