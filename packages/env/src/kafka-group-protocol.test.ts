import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker/balanceWorkerEnv.js";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";
import { createHeraldEnv } from "./herald.js";

const base = {
	KAFKA_BROKERS: "localhost:19092",
	KAFKA_AUTH_MODE: "none",
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
};

const services = [
	["worker", createBalanceWorkerEnv],
	["ownership reader", createBalanceWorkerClientEnv],
	["herald", createHeraldEnv],
] as const;

for (const [name, createEnv] of services) {
	describe(`${name} Kafka group protocol`, () => {
		test("speaks KIP-848 unless told otherwise", () => {
			expect(createEnv(base)).toHaveProperty(
				"KAFKA_GROUP_PROTOCOL",
				"consumer",
			);
		});

		test("falls back to the classic protocol when the cluster cannot do KIP-848", () => {
			expect(
				createEnv({ ...base, KAFKA_GROUP_PROTOCOL: "classic" }),
			).toHaveProperty("KAFKA_GROUP_PROTOCOL", "classic");
		});

		test("refuses a protocol it does not know", () => {
			expect(() =>
				createEnv({ ...base, KAFKA_GROUP_PROTOCOL: "cooperative" }),
			).toThrow("KAFKA_GROUP_PROTOCOL must be consumer or classic");
		});
	});
}
