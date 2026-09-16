import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker.js";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";

const brokers = { KAFKA_BROKERS: "localhost:19092" };

for (const [name, createEnv] of [
	["worker", createBalanceWorkerEnv],
	["ownership reader", createBalanceWorkerClientEnv],
] as const) {
	describe(`${name} Kafka authentication`, () => {
		test("keeps local Kafka unauthenticated by default", () => {
			expect(createEnv(brokers)).toHaveProperty("KAFKA_AUTH_MODE", "none");
		});

		test("does not infer IAM authentication from an AWS region", () => {
			expect(createEnv({ ...brokers, AWS_REGION: "us-east-1" })).toHaveProperty(
				"KAFKA_AUTH_MODE",
				"none",
			);
		});

		test("accepts explicit unauthenticated mode without AWS configuration", () => {
			expect(createEnv({ ...brokers, KAFKA_AUTH_MODE: "none" })).toHaveProperty(
				"KAFKA_AUTH_MODE",
				"none",
			);
		});

		test("preserves IAM mode and its normalized signing region", () => {
			expect(
				createEnv({
					...brokers,
					KAFKA_AUTH_MODE: "msk_iam",
					AWS_REGION: " us-east-1 ",
				}),
			).toMatchObject({
				KAFKA_AUTH_MODE: "msk_iam",
				AWS_REGION: "us-east-1",
			});
		});

		test.each([undefined, "", " "])(
			"rejects IAM mode without a signing region: %j",
			(region) => {
				expect(() =>
					createEnv({
						...brokers,
						KAFKA_AUTH_MODE: "msk_iam",
						AWS_REGION: region,
					}),
				).toThrow("requires AWS_REGION");
			},
		);

		test.each(["iam", "msk", "MSK_IAM", "", " "])(
			"rejects an unknown auth mode instead of falling back to plaintext: %j",
			(mode) => {
				expect(() =>
					createEnv({
						...brokers,
						KAFKA_AUTH_MODE: mode,
						AWS_REGION: "us-east-1",
					}),
				).toThrow("KAFKA_AUTH_MODE");
			},
		);
	});
}

test("IAM authentication does not enable direct balance routing", () => {
	expect(
		createBalanceWorkerClientEnv({
			...brokers,
			NODE_ENV: "production",
			KAFKA_AUTH_MODE: "msk_iam",
			AWS_REGION: "us-east-1",
		}).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
});
