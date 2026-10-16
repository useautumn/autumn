import { expect, test } from "bun:test";
import { nativeClientConfigOf } from "../../../src/client/librdkafka/nativeClientConfig.js";

const base = {
	clientId: "c",
	brokers: ["a:9092", "b:9092"],
	connectionTimeout: 1_000,
	requestTimeout: 1_000,
	retry: { retries: 1, initialRetryTime: 1, maxRetryTime: 1 },
};

test("SASL credentials go over TLS with librdkafka's mechanism names", () => {
	expect(
		nativeClientConfigOf({
			config: {
				...base,
				ssl: true,
				sasl: { mechanism: "plain", username: "key", password: "secret" },
			},
		}),
	).toMatchObject({
		"bootstrap.servers": "a:9092,b:9092",
		"security.protocol": "SASL_SSL",
		"sasl.mechanisms": "PLAIN",
		"sasl.username": "key",
		"sasl.password": "secret",
	});
	expect(
		nativeClientConfigOf({
			config: {
				...base,
				ssl: true,
				sasl: { mechanism: "scram-sha-512", username: "u", password: "p" },
			},
		})["sasl.mechanisms"],
	).toBe("SCRAM-SHA-512");
});

test("a local cluster is plaintext with no SASL settings", () => {
	const config = nativeClientConfigOf({ config: base });
	expect(config["security.protocol"]).toBe("PLAINTEXT");
	expect(config).not.toHaveProperty("sasl.mechanisms");
});
