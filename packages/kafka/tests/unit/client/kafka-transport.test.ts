import { expect, test } from "bun:test";
import { createKafkaTransport } from "../../../src/client/createKafkaTransport.js";

test("local transport is plaintext with no credentials", () => {
	expect(createKafkaTransport({ authMode: "none" })).toEqual({});
});

test("SCRAM uses TLS with its credentials", () => {
	const scram = {
		mechanism: "scram-sha-256" as const,
		username: "tf-redpanda-staging-server",
		password: "secret",
	};
	expect(createKafkaTransport({ authMode: "scram", sasl: scram })).toEqual({
		ssl: true,
		sasl: scram,
	});
});

test("SCRAM without a username and password is refused", () => {
	expect(() => createKafkaTransport({ authMode: "scram" })).toThrow(
		"SASL authentication requires a username and password",
	);
	expect(() =>
		createKafkaTransport({
			authMode: "scram",
			sasl: { mechanism: "scram-sha-512", username: "", password: "secret" },
		}),
	).toThrow("SASL authentication requires a username and password");
});

test("PLAIN uses TLS with its credentials", () => {
	const sasl = {
		mechanism: "plain" as const,
		username: "confluent-api-key",
		password: "secret",
	};
	expect(createKafkaTransport({ authMode: "plain", sasl })).toEqual({
		ssl: true,
		sasl,
	});
});

test("PLAIN without a username and password is refused", () => {
	expect(() => createKafkaTransport({ authMode: "plain" })).toThrow(
		"SASL authentication requires a username and password",
	);
});
