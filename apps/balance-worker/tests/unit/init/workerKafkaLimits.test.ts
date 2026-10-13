import { expect, test } from "bun:test";
import {
	WORKER_KAFKA_CLIENT_LIMITS,
	WORKER_KAFKA_PRODUCER_LIMITS,
} from "../../../src/init/workerResources.js";

const BROKER_HANDSHAKE_BLACKOUT_MS = 150_000;

function retryBudgetMs({
	requestTimeoutMs,
	retryCount,
}: {
	requestTimeoutMs: number;
	retryCount: number;
}): number {
	return (retryCount + 1) * requestTimeoutMs;
}

test("the producer thread gives up on a silent broker connection within 5 s", () => {
	expect(WORKER_KAFKA_PRODUCER_LIMITS.requestTimeoutMs).toBeLessThanOrEqual(
		5_000,
	);
});

test("consumers keep the long request timeout a follower's group sync can need", () => {
	expect(WORKER_KAFKA_CLIENT_LIMITS.requestTimeoutMs).toBe(30_000);
});

test("consumers outlast a broker that answers no handshake for two and a half minutes", () => {
	expect(retryBudgetMs(WORKER_KAFKA_CLIENT_LIMITS)).toBeGreaterThanOrEqual(
		BROKER_HANDSHAKE_BLACKOUT_MS,
	);
});

test("the producer thread still fails a dead broker inside 15 s", () => {
	expect(retryBudgetMs(WORKER_KAFKA_PRODUCER_LIMITS)).toBeLessThanOrEqual(
		15_000,
	);
});

test("the producer thread keeps every other client limit", () => {
	const {
		requestTimeoutMs: _producerTimeout,
		retryCount: _producerRetries,
		...producer
	} = WORKER_KAFKA_PRODUCER_LIMITS;
	const {
		requestTimeoutMs: _clientTimeout,
		retryCount: _clientRetries,
		...client
	} = WORKER_KAFKA_CLIENT_LIMITS;
	expect(producer).toEqual(client);
});
