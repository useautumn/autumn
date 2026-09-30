import { expect, test } from "bun:test";
import {
	KafkaJSNonRetriableError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
} from "kafkajs";
import { isKafkaAccessRefusal } from "../../src/consumer/consumerErrors.js";

function protocolError({
	type,
	code,
	message,
}: {
	type: string;
	code: number;
	message: string;
}): KafkaJSProtocolError {
	return new KafkaJSProtocolError(
		Object.assign(new Error(message), { type, code, retriable: false }),
	);
}

test("a broker refusing the group, a topic or the cluster is an access refusal, through any wrapping", () => {
	const group = protocolError({
		type: "GROUP_AUTHORIZATION_FAILED",
		code: 30,
		message: "Not authorized to access group: Group authorization failed",
	});
	const topic = protocolError({
		type: "TOPIC_AUTHORIZATION_FAILED",
		code: 29,
		message: "Not authorized to access topics: [Topic authorization failed]",
	});
	const cluster = protocolError({
		type: "CLUSTER_AUTHORIZATION_FAILED",
		code: 31,
		message: "Cluster authorization failed",
	});
	expect(isKafkaAccessRefusal({ cause: group })).toBe(true);
	expect(isKafkaAccessRefusal({ cause: topic })).toBe(true);
	expect(isKafkaAccessRefusal({ cause: cluster })).toBe(true);
	expect(
		isKafkaAccessRefusal({
			cause: new Error("consumer crashed", { cause: group }),
		}),
	).toBe(true);
	expect(
		isKafkaAccessRefusal({
			cause: new KafkaJSNumberOfRetriesExceeded(topic, {
				retryCount: 2,
				retryTime: 100,
			}),
		}),
	).toBe(true);
});

test("a failed SASL authentication is an access refusal too", () => {
	const sasl = Object.assign(
		new KafkaJSNonRetriableError("SASL OAUTHBEARER authentication failed"),
		{ name: "KafkaJSSASLAuthenticationError" },
	);
	expect(isKafkaAccessRefusal({ cause: sasl })).toBe(true);
});

test("anything else is not: a refused batch, a lost connection, a bad record, or a cycle", () => {
	expect(
		isKafkaAccessRefusal({
			cause: protocolError({
				type: "CONCURRENT_TRANSACTIONS",
				code: 51,
				message: "concurrent operation ongoing",
			}),
		}),
	).toBe(false);
	expect(
		isKafkaAccessRefusal({
			cause: new KafkaJSNonRetriableError("Connection closed"),
		}),
	).toBe(false);
	expect(isKafkaAccessRefusal({ cause: "not an error" })).toBe(false);
	const loop = new Error("a");
	loop.cause = loop;
	expect(isKafkaAccessRefusal({ cause: loop })).toBe(false);
});
