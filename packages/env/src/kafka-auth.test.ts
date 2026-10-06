import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker/balanceWorkerEnv.js";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";
import { createHeraldEnv } from "./herald.js";

const brokers = {
	KAFKA_BROKERS: "localhost:19092",
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
};

const services = [
	["worker", createBalanceWorkerEnv, "BALANCE_WORKER"],
	["ownership reader", createBalanceWorkerClientEnv, "SERVER"],
	["herald", createHeraldEnv, "HERALD"],
] as const;

for (const [name, createEnv, service] of services) {
	const username = `KAFKA_SASL_USERNAME_${service}`;
	const password = `KAFKA_SASL_PASSWORD_${service}`;
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
					[username]: "tf-redpanda-staging-server",
					[password]: "secret",
				}),
			).toMatchObject({
				KAFKA_AUTH_MODE: "scram",
				KAFKA_SASL: {
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
					[username]: "user",
					[password]: "secret",
				}),
			).toHaveProperty("KAFKA_SASL.mechanism", "scram-sha-512");
		});

		test.each([
			{ [password]: "secret" },
			{ [username]: "user" },
			{ [username]: " ", [password]: "secret" },
			{ [username]: "user", [password]: "" },
		])("rejects SCRAM without a username and password: %j", (credentials) => {
			expect(() =>
				createEnv({ ...brokers, KAFKA_AUTH_MODE: "scram", ...credentials }),
			).toThrow(`requires ${username} and ${password}`);
		});

		test.each(["plain", "SCRAM-SHA-256", "scram-sha-1"])(
			"rejects an unknown SCRAM mechanism: %j",
			(mechanism) => {
				expect(() =>
					createEnv({
						...brokers,
						KAFKA_AUTH_MODE: "scram",
						KAFKA_SASL_MECHANISM: mechanism,
						[username]: "user",
						[password]: "secret",
					}),
				).toThrow("KAFKA_SASL_MECHANISM");
			},
		);

		test("PLAIN carries this service's credentials and ignores the SCRAM mechanism", () => {
			expect(
				createEnv({
					...brokers,
					KAFKA_AUTH_MODE: "plain",
					KAFKA_SASL_MECHANISM: "scram-sha-512",
					[username]: "confluent-api-key",
					[password]: "secret",
				}),
			).toMatchObject({
				KAFKA_AUTH_MODE: "plain",
				KAFKA_SASL: {
					mechanism: "plain",
					username: "confluent-api-key",
					password: "secret",
				},
			});
		});

		test("rejects PLAIN without a username and password", () => {
			expect(() =>
				createEnv({ ...brokers, KAFKA_AUTH_MODE: "plain", [username]: "user" }),
			).toThrow(`KAFKA_AUTH_MODE=plain requires ${username} and ${password}`);
		});

		test("other modes never carry SCRAM credentials", () => {
			expect(
				createEnv({
					...brokers,
					AWS_REGION: "us-east-1",
					[username]: "user",
					[password]: "secret",
				}),
			).toHaveProperty("KAFKA_SASL", undefined);
		});

		test("SCRAM reads only this service's credentials", () => {
			const others = Object.fromEntries(
				services
					.filter(([, , other]) => other !== service)
					.flatMap(([, , other]) => [
						[`KAFKA_SASL_USERNAME_${other}`, `user-${other}`],
						[`KAFKA_SASL_PASSWORD_${other}`, `secret-${other}`],
					]),
			);
			expect(() =>
				createEnv({ ...brokers, KAFKA_AUTH_MODE: "scram", ...others }),
			).toThrow(`requires ${username} and ${password}`);
			expect(
				createEnv({
					...brokers,
					KAFKA_AUTH_MODE: "scram",
					...others,
					[username]: "mine",
					[password]: "my-secret",
				}),
			).toHaveProperty("KAFKA_SASL", {
				mechanism: "scram-sha-256",
				username: "mine",
				password: "my-secret",
			});
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
