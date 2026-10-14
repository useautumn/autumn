import type { KafkaSaslCredentials } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import type { Ring } from "../../../threads/ring/types/ring.js";
import type { ProducerError } from "./producerError.js";

export type ProducerConfigSnapshot = Pick<
	ProducerConfig,
	| "transactionalId"
	| "idempotent"
	| "maxInFlightRequests"
	| "allowAutoTopicCreation"
	| "retry"
	| "transactionTimeout"
	| "metadataMaxAge"
> & { explicitPartitioner: boolean };

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
	sendSignal: SharedArrayBuffer;
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
	| { kind: "send"; bytes: ArrayBuffer }
	| { kind: "stop" };

export type ProducerToDecideMessage =
	| { kind: "ready" }
	| { kind: "error"; message: string }
	| { kind: "done"; reqId: number }
	| { kind: "failed"; reqId: number; error: ProducerError }
	| { kind: "request"; event: KafkaRequestEvent }
	| { kind: "token"; info: unknown }
	| { kind: "stopped" };
