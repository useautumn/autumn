import { expect, test } from "bun:test";
import { isKafkaAccessRefusal } from "../../src/consumer/consumerErrors.js";

/** A librdkafka error as the client hands it over: a message and the broker's (or the client's) code. */
function librdkafkaError({
	code,
	message,
}: {
	code: number;
	message: string;
}): Error {
	return Object.assign(new Error(message), { code, isRetriable: false });
}

test("a broker refusing the group, a topic or the cluster is an access refusal, through any wrapping", () => {
	const group = librdkafkaError({
		code: 30,
		message: "Broker: Group authorization failed",
	});
	const topic = librdkafkaError({
		code: 29,
		message: "Broker: Topic authorization failed",
	});
	const cluster = librdkafkaError({
		code: 31,
		message: "Broker: Cluster authorization failed",
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
			cause: new AggregateError(
				[new Error("other"), topic],
				"retries exhausted",
			),
		}),
	).toBe(true);
});

test("a failed SASL authentication is an access refusal too", () => {
	const broker = librdkafkaError({
		code: 58,
		message: "Broker: SASL Authentication failed",
	});
	const client = librdkafkaError({
		code: -169,
		message: "Local: Authentication failure",
	});
	expect(isKafkaAccessRefusal({ cause: broker })).toBe(true);
	expect(isKafkaAccessRefusal({ cause: client })).toBe(true);
});

test("anything else is not: a refused batch, a lost connection, a bad record, or a cycle", () => {
	expect(
		isKafkaAccessRefusal({
			cause: librdkafkaError({
				code: 51,
				message:
					"Broker: Producer attempted to update a transaction while another concurrent operation on the same transaction was ongoing",
			}),
		}),
	).toBe(false);
	expect(
		isKafkaAccessRefusal({
			cause: librdkafkaError({
				code: -195,
				message: "Local: Broker transport failure",
			}),
		}),
	).toBe(false);
	expect(isKafkaAccessRefusal({ cause: "not an error" })).toBe(false);
	const loop = new Error("a");
	loop.cause = loop;
	expect(isKafkaAccessRefusal({ cause: loop })).toBe(false);
});
