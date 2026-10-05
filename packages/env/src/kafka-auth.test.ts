import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker/balanceWorkerEnv.js";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";

const brokers = {
	KAFKA_BROKERS: "localhost:19092",
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
};

for (const [name, createEnv] of [
	["worker", createBalanceWorkerEnv],
	["ownership reader", createBalanceWorkerClientEnv],
] as const) {
	describe(`${name} Kafka authentication`, () => {
		test("defaults to MSK IAM without a deployment auth setting", () => {
			expect(createEnv({ ...brokers, AWS_REGION: "us-east-1" })).toHaveProperty(
				"KAFKA_AUTH_MODE",
				"msk_iam",
			);
		});

		test("does not fall back to plaintext when the default IAM region is missing", () => {
			expect(() => createEnv(brokers)).toThrow("requires AWS_REGION");
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

		test("SCRAM carries its credentials, defaults to SHA-256 and needs no AWS region", () => {
			expect(
				createEnv({
					...brokers,
					KAFKA_AUTH_MODE: "scram",
					KAFKA_SASL_USERNAME: "tf-redpanda-staging-server",
					KAFKA_SASL_PASSWORD: "secret",
				}),
			).toMatchObject({
				KAFKA_AUTH_MODE: "scram",
				KAFKA_SCRAM: {
					mechanism: "scram-sha-256",
					username: "tf-redpanda-staging-server",
					password: "secret",
				},
			});
		});

		test("SCRAM accepts SHA-512", () => {
			expect(
				createEnv({
					...brokers,
					KAFKA_AUTH_MODE: "scram",
					KAFKA_SASL_MECHANISM: "scram-sha-512",
					KAFKA_SASL_USERNAME: "user",
					KAFKA_SASL_PASSWORD: "secret",
				}),
			).toHaveProperty("KAFKA_SCRAM.mechanism", "scram-sha-512");
		});

		test.each([
			{ KAFKA_SASL_PASSWORD: "secret" },
			{ KAFKA_SASL_USERNAME: "user" },
			{ KAFKA_SASL_USERNAME: " ", KAFKA_SASL_PASSWORD: "secret" },
			{ KAFKA_SASL_USERNAME: "user", KAFKA_SASL_PASSWORD: "" },
		])("rejects SCRAM without a username and password: %j", (credentials) => {
			expect(() =>
				createEnv({ ...brokers, KAFKA_AUTH_MODE: "scram", ...credentials }),
			).toThrow("requires KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD");
		});

		test.each(["plain", "SCRAM-SHA-256", "scram-sha-1"])(
			"rejects an unknown SCRAM mechanism: %j",
			(mechanism) => {
				expect(() =>
					createEnv({
						...brokers,
						KAFKA_AUTH_MODE: "scram",
						KAFKA_SASL_MECHANISM: mechanism,
						KAFKA_SASL_USERNAME: "user",
						KAFKA_SASL_PASSWORD: "secret",
					}),
				).toThrow("KAFKA_SASL_MECHANISM");
			},
		);

		test("other modes never carry SCRAM credentials", () => {
			expect(
				createEnv({
					...brokers,
					AWS_REGION: "us-east-1",
					KAFKA_SASL_USERNAME: "user",
					KAFKA_SASL_PASSWORD: "secret",
				}),
			).toHaveProperty("KAFKA_SCRAM", undefined);
		});

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
