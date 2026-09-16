import { expect, test } from "bun:test";
import {
	createProducerSession,
	type KafkaProducerClient,
	type KafkaTransaction,
} from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createWorkerProducerConfig } from "../../../src/init/workerConfig.js";

const limits = {
	transactionTimeoutMs: 15_000,
	retryCount: 3,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 2_000,
};

function createsConfiguredSessionWithoutStarting(): void {
	let receivedConfig: ProducerConfig | undefined;
	const lifecycle: string[] = [];

	async function connect(): Promise<void> {
		lifecycle.push("connect");
	}

	async function disconnect(): Promise<void> {
		lifecycle.push("disconnect");
	}

	async function transaction(): Promise<KafkaTransaction> {
		throw new Error("Construction must not open a transaction");
	}

	function createProducer(config: ProducerConfig): KafkaProducerClient {
		receivedConfig = config;
		return { connect, disconnect, transaction };
	}

	const session = createProducerSession({
		ctx: { kafka: { producer: createProducer } },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "staging/eu-west-1",
			topic: "metering-events-v1",
			partition: 3,
			limits,
		}),
	});

	expect(lifecycle).toEqual([]);
	expect(session.isUsable()).toBe(false);
	expect(receivedConfig).toEqual({
		transactionalId:
			"autumn-balance-worker:staging%2Feu-west-1:metering-events-v1:3",
		idempotent: true,
		maxInFlightRequests: 1,
		transactionTimeout: 15_000,
		retry: {
			retries: 3,
			initialRetryTime: 100,
			maxRetryTime: 2_000,
		},
	});
}

function preservesOwnershipIdentity(): void {
	const first = createWorkerProducerConfig({
		deploymentEnvironment: "staging",
		topic: "metering-events-v1",
		partition: 3,
		limits,
	});
	const same = createWorkerProducerConfig({
		deploymentEnvironment: "staging",
		topic: "metering-events-v1",
		partition: 3,
		limits,
	});
	const replacementPartition = createWorkerProducerConfig({
		deploymentEnvironment: "staging",
		topic: "metering-events-v1",
		partition: 4,
		limits,
	});

	expect(same.transactionalId).toBe(first.transactionalId);
	expect(replacementPartition.transactionalId).not.toBe(first.transactionalId);
}

function rejectsInvalidLimits(): void {
	function createProducer(): KafkaProducerClient {
		throw new Error("Invalid limits must be rejected before construction");
	}

	function createInvalidSession(): void {
		createProducerSession({
			ctx: { kafka: { producer: createProducer } },
			config: createWorkerProducerConfig({
				deploymentEnvironment: "staging",
				topic: "metering-events-v1",
				partition: 0,
				limits: { ...limits, retryCount: Number.MAX_SAFE_INTEGER - 1 },
			}),
		});
	}

	expect(createInvalidSession).toThrow("retryCount");
}

test(
	"uses a stable transactional identity and bounded settings without starting",
	createsConfiguredSessionWithoutStarting,
);
test(
	"changes the transactional identity only when ownership coordinates change",
	preservesOwnershipIdentity,
);
test("rejects unbounded or invalid producer limits", rejectsInvalidLimits);
