import { expect, test } from "bun:test";
import {
	WORKER_KAFKA_CLIENT_LIMITS,
	WORKER_KAFKA_PRODUCER_LIMITS,
} from "../../../src/init/workerResources.js";

test("the producer thread gives up on a silent broker connection within 5 s", () => {
	expect(WORKER_KAFKA_PRODUCER_LIMITS.requestTimeoutMs).toBeLessThanOrEqual(
		5_000,
	);
});

test("consumers keep the long request timeout a follower's group sync can need", () => {
	expect(WORKER_KAFKA_CLIENT_LIMITS.requestTimeoutMs).toBe(30_000);
});

test("the producer thread keeps every other client limit", () => {
	const { requestTimeoutMs: _producer, ...producer } =
		WORKER_KAFKA_PRODUCER_LIMITS;
	const { requestTimeoutMs: _client, ...client } = WORKER_KAFKA_CLIENT_LIMITS;
	expect(producer).toEqual(client);
});
