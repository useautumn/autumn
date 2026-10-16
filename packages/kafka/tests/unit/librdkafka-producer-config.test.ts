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

// The KafkaJS shim sets `retries` to 5 unless told otherwise, and librdkafka would honour it.
test("a plain producer's own retry count reaches librdkafka", () => {
	const config = nativeProducerConfigOf({
		config: { retry: { retries: 10 } },
		defaults,
	});
	expect(config.retries).toBe(10);
});

// Exhausted retries fail a possibly-written record with a broker code; only the timeout should end it.
test("an idempotent producer retries until its message timeout, never for a count", () => {
	for (const config of [{ idempotent: true }, { transactionalId: "owner-3" }]) {
		expect(nativeProducerConfigOf({ config, defaults }).retries).toBe(
			2_147_483_647,
		);
	}
});
