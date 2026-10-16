import { describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	KafkaDeliveryReportOverdueError,
	KafkaPartialDeliveryError,
} from "@autumn/kafka";
import { isRetriableAppendError } from "@/internal/balances/track/balanceWorker/spool/isRetriableAppendError.js";

/** librdkafka's error shape: the message, a numeric code (negative for its own), and its retriable verdict. */
const librdkafkaError = ({
	message,
	code,
	isRetriable = true,
}: {
	message: string;
	code: number;
	isRetriable?: boolean;
}) => Object.assign(new Error(message), { code, isRetriable });

describe("isRetriableAppendError", () => {
	test.each([
		[
			"a send librdkafka gave up on at its message timeout",
			librdkafkaError({ message: "Local: Message timed out", code: -192 }),
		],
		[
			"a dropped broker connection",
			librdkafkaError({
				message: "Local: Broker transport failure",
				code: -195,
			}),
		],
		[
			"every broker down while one restarts",
			librdkafkaError({
				message: "Local: All broker connections are down",
				code: -187,
			}),
		],
		[
			"NOT_LEADER_FOR_PARTITION",
			librdkafkaError({ message: "Broker: Not leader for partition", code: 6 }),
		],
		[
			"LEADER_NOT_AVAILABLE",
			librdkafkaError({ message: "Broker: Leader not available", code: 5 }),
		],
		[
			"REQUEST_TIMED_OUT",
			librdkafkaError({ message: "Broker: Request timed out", code: 7 }),
		],
		[
			"a delivery report that never arrived",
			new KafkaDeliveryReportOverdueError({
				topic: "commands",
				deadlineMs: 6_000,
			}),
		],
		[
			"a send only part of which landed",
			new KafkaPartialDeliveryError({
				delivered: 1,
				total: 2,
				failure: librdkafkaError({
					message: "Local: Message timed out",
					code: -192,
				}),
			}),
		],
		[
			"a timeout wrapped by the client",
			new Error("Command log append failed", {
				cause: librdkafkaError({
					message: "Local: Message timed out",
					code: -192,
				}),
			}),
		],
	])("retries %s", (_, error) => {
		expect(isRetriableAppendError(error)).toBe(true);
	});

	test.each([
		[
			"a broker refusal no retry fixes",
			librdkafkaError({
				message: "Broker: Message size too large",
				code: 10,
				isRetriable: false,
			}),
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
