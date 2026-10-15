import { describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	KafkaJSConnectionError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
	KafkaJSRequestTimeoutError,
} from "kafkajs";
import { isRetriableAppendError } from "@/internal/balances/track/balanceWorker/spool/isRetriableAppendError.js";

const protocolError = ({
	type,
	code,
	retriable = true,
}: {
	type: string;
	code: number;
	retriable?: boolean;
}) =>
	new KafkaJSProtocolError(
		Object.assign(new Error(type), { type, code, retriable }),
	);
const retriesRanOutOn = (cause: Error) =>
	new KafkaJSNumberOfRetriesExceeded(cause, { retryCount: 3, retryTime: 900 });

describe("isRetriableAppendError", () => {
	test.each([
		[
			"a closed connection, once kafkajs's retries ran out",
			retriesRanOutOn(
				// kafkajs's typings omit KafkaJSConnectionClosedError; this is its shape.
				Object.assign(new KafkaJSConnectionError("Closed connection"), {
					name: "KafkaJSConnectionClosedError",
				}),
			),
		],
		[
			"a refused connection while the broker restarts",
			retriesRanOutOn(
				new KafkaJSConnectionError("Connection error: connect ECONNREFUSED", {
					code: "ECONNREFUSED",
				}),
			),
		],
		[
			"a request timeout",
			new KafkaJSRequestTimeoutError("Request Produce(key: 0) timed out"),
		],
		[
			"NOT_LEADER_FOR_PARTITION",
			retriesRanOutOn(
				protocolError({ type: "NOT_LEADER_FOR_PARTITION", code: 6 }),
			),
		],
		[
			"LEADER_NOT_AVAILABLE",
			protocolError({ type: "LEADER_NOT_AVAILABLE", code: 5 }),
		],
		[
			"REQUEST_TIMED_OUT",
			protocolError({ type: "REQUEST_TIMED_OUT", code: 7 }),
		],
		[
			"a leader move reported by protocol code alone",
			Object.assign(new Error("Broker: Not leader for partition"), { code: 6 }),
		],
	])("retries %s", (_, error) => {
		expect(isRetriableAppendError(error)).toBe(true);
	});

	test.each([
		[
			"a broker refusal no retry fixes",
			protocolError({ type: "MESSAGE_TOO_LARGE", code: 10, retriable: false }),
		],
		[
			"the client's own deadline",
			new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "unknown",
				message: "Worker request deadline exceeded",
			}),
		],
		[
			"a client with no command log",
			new BalanceWorkerClientError({
				code: "COMMAND_LOG_UNAVAILABLE",
				outcome: "not_submitted",
				message: "no command log",
			}),
		],
		["an unknown error", new Error("boom")],
		["nothing at all", undefined],
	])("does not retry %s", (_, error) => {
		expect(isRetriableAppendError(error)).toBe(false);
	});
});
