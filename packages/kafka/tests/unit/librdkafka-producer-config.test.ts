import { expect, test } from "bun:test";
import { nativeProducerConfigOf } from "../../src/client/librdkafka/producer/createLibrdkafkaProducer.js";

const defaults = {
	requestTimeout: 10_000,
	retry: { retries: 3, initialRetryTime: 100, maxRetryTime: 1_000 },
};

test("a transactional producer never waits on a send past its transaction timeout: librdkafka refuses to start otherwise", () => {
	const config = nativeProducerConfigOf({
		config: { transactionalId: "owner-3", transactionTimeout: 10_000 },
		defaults,
	});
	expect(config["message.timeout.ms"]).toBe(10_000);
});

test("an idempotent producer keeps the whole retry window", () => {
	const config = nativeProducerConfigOf({
		config: { idempotent: true },
		defaults,
	});
	expect(config["message.timeout.ms"]).toBe(10_000 + 100 + 200 + 400);
});
