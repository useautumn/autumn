import type { KafkaSaslCredentials, ProducerConfig } from "@autumn/kafka";
import type { Ring } from "../../../threads/ring/types/ring.js";
import type { ProducerError } from "./producerError.js";

/** The structured-clone-safe part of a `ProducerConfig`. */
export type ProducerConfigSnapshot = Pick<
	ProducerConfig,
	| "transactionalId"
	| "idempotent"
	| "maxInFlightRequests"
	| "transactionTimeout"
	| "allowAutoTopicCreation"
	| "retry"
	| "compression"
	| "lingerMs"
>;

/** The decide thread's Kafka client inputs, rebuilt on the producer thread. */
export type ProducerThreadInit = {
	clientId: string;
	brokers: string[];
	authMode: "none" | "msk_iam" | "scram" | "plain";
	region?: string;
	sasl?: KafkaSaslCredentials;
	limits: {
		connectionTimeoutMs: number;
		requestTimeoutMs: number;
		retryCount: number;
		initialRetryTimeMs: number;
		maxRetryTimeMs: number;
	};
	sendRing: Ring;
	ackRing: Ring;
	/** Woken by the decide thread when it publishes sends; the producer thread sleeps on it. */
	sendSignal: SharedArrayBuffer;
	/** Woken by the producer thread when it publishes acks; the decide thread sleeps on it. */
	ackSignal: SharedArrayBuffer;
};

export type KafkaRequestEvent = {
	producerId: number;
	apiName: string;
	broker: string;
	durationMs: number;
	pendingMs: number;
};

export type DecideToProducerMessage =
	| { kind: "create"; producerId: number; config: ProducerConfigSnapshot }
	| { kind: "connect"; producerId: number; reqId: number }
	| { kind: "disconnect"; producerId: number; reqId: number }
	/** A send frame too big for the ring travels here, in its own buffer. */
	| { kind: "send"; bytes: ArrayBuffer }
	| { kind: "stop" };

export type ProducerToDecideMessage =
	| { kind: "ready" }
	| { kind: "error"; message: string }
	| { kind: "done"; reqId: number }
	| { kind: "failed"; reqId: number; error: ProducerError }
	/** One per broker per statistics window, for `kafkaRequestTimings`. */
	| { kind: "request"; event: KafkaRequestEvent }
	| { kind: "token"; info: unknown }
	| { kind: "stopped" };
