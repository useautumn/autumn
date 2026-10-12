import { describe, expect, test } from "bun:test";
import { validateReplayStagingTarget } from "@server/internal/balances/replay/targets/validateReplayStagingTarget.js";
import {
	buildReplayStagingTargetInput,
	readReplayKafkaSasl,
} from "./readReplayOperatorInputs.js";

const policy = {
	database: {
		hostname: "replay-db.example.internal",
		port: 5432,
		database: "replay",
	},
};
const databaseUrl =
	"postgresql://reader:secret@replay-db.example.internal:5432/replay";

describe("replay staging target", () => {
	test("pins the Redpanda rp-64 deployment", () => {
		const target = validateReplayStagingTarget({
			target: buildReplayStagingTargetInput({ databaseUrl }),
			policy,
		});

		expect(target.deployment).toBe("tf-balance-staging-rp-64");
		expect(target.topic).toBe("tf-balance-staging-rp-64-ownership");
		expect(target.brokers).toEqual([
			"db1oj6movvaen4fam8pg.any.us-east-1.aw.priv.prd.cloud.redpanda.com:9092",
		]);
		expect(target.partitionCount).toBe(64);
	});
});

describe("readReplayKafkaSasl", () => {
	test("reads the server SCRAM user", () => {
		expect(
			readReplayKafkaSasl({
				runtimeEnv: {
					KAFKA_SASL_USERNAME_SERVER: "server-user",
					KAFKA_SASL_PASSWORD_SERVER: "server-password",
				},
			}),
		).toEqual({
			mechanism: "scram-sha-256",
			username: "server-user",
			password: "server-password",
		});
	});

	test("pins SCRAM regardless of the ambient auth settings", () => {
		expect(
			readReplayKafkaSasl({
				runtimeEnv: {
					KAFKA_AUTH_MODE: "plain",
					KAFKA_SASL_MECHANISM: "scram-sha-512",
					KAFKA_SASL_USERNAME_SERVER: "server-user",
					KAFKA_SASL_PASSWORD_SERVER: "server-password",
				},
			}).mechanism,
		).toBe("scram-sha-256");
	});

	test("requires both server credentials", () => {
		expect(() =>
			readReplayKafkaSasl({
				runtimeEnv: { KAFKA_SASL_USERNAME_SERVER: "server-user" },
			}),
		).toThrow("KAFKA_SASL_PASSWORD_SERVER");
		expect(() =>
			readReplayKafkaSasl({
				runtimeEnv: { KAFKA_SASL_PASSWORD_SERVER: "server-password" },
			}),
		).toThrow("KAFKA_SASL_USERNAME_SERVER");
	});
});
