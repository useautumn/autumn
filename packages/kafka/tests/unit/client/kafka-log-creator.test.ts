import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { type LogEntry, logLevel } from "kafkajs";
import {
	createKafkaLogCreator,
	type KafkaLogSink,
	routineRefusalMessages,
} from "../../../src/client/kafkaLogCreator.js";

const CONCURRENT_TRANSACTIONS =
	"The producer attempted to update a transaction while another concurrent operation on the same transaction was ongoing";
const GROUP_AUTHORIZATION_FAILED =
	"Not authorized to access group: Group authorization failed";
const REBALANCE_IN_PROGRESS = "The group is rebalancing, so a rejoin is needed";

function refusedResponse({ error }: { error: string }): LogEntry {
	return {
		namespace: "Connection",
		level: logLevel.ERROR,
		label: "ERROR",
		log: {
			timestamp: "2026-09-29T12:03:28.000Z",
			message: "Response AddOffsetsToTxn(key: 25, version: 1)",
			error,
			correlationId: 7,
			size: 12,
			clientId: "balance-worker-1",
			broker: "b-1:9098",
		},
	};
}

function recordingSink() {
	const written: { method: keyof KafkaLogSink; line: string }[] = [];
	const sink: KafkaLogSink = {
		error(line) {
			written.push({ method: "error", line });
		},
		warn(line) {
			written.push({ method: "warn", line });
		},
		info(line) {
			written.push({ method: "info", line });
		},
		debug(line) {
			written.push({ method: "debug", line });
		},
	};
	return { sink, written };
}

test("a coordinator still closing the last transaction is not an error line at the default level", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.INFO);
	write(refusedResponse({ error: CONCURRENT_TRANSACTIONS }));
	expect(written).toEqual([]);
});

test("the same refusal is written as DEBUG when the client logs at DEBUG", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.DEBUG);
	write(refusedResponse({ error: CONCURRENT_TRANSACTIONS }));
	expect(written).toHaveLength(1);
	expect(written[0]?.method).toBe("debug");
	expect(JSON.parse(written[0]?.line ?? "{}")).toMatchObject({
		level: "DEBUG",
		error: CONCURRENT_TRANSACTIONS,
	});
});

test("a real refusal keeps kafkajs's ERROR line and shape", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.INFO);
	write(refusedResponse({ error: GROUP_AUTHORIZATION_FAILED }));
	expect(written).toHaveLength(1);
	expect(written[0]?.method).toBe("error");
	expect(JSON.parse(written[0]?.line ?? "{}")).toEqual({
		level: "ERROR",
		timestamp: "2026-09-29T12:03:28.000Z",
		message: "[Connection] Response AddOffsetsToTxn(key: 25, version: 1)",
		error: GROUP_AUTHORIZATION_FAILED,
		correlationId: 7,
		size: 12,
		clientId: "balance-worker-1",
		broker: "b-1:9098",
	});
});

test("a rebalance in progress is informational", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.INFO);
	write(refusedResponse({ error: REBALANCE_IN_PROGRESS }));
	expect(written).toHaveLength(1);
	expect(written[0]?.method).toBe("info");
	expect(JSON.parse(written[0]?.line ?? "{}")).toMatchObject({ level: "INFO" });
});

test("entries without a refusal pass through at their own level", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.INFO);
	write({
		namespace: "Consumer",
		level: logLevel.WARN,
		label: "WARN",
		log: { timestamp: "t", message: "The group is rebalancing, re-joining" },
	});
	expect(written).toHaveLength(1);
	expect(written[0]?.method).toBe("warn");
});

test("every lowered message is one kafkajs itself produces", () => {
	const require = createRequire(import.meta.url);
	const { errorCodes } = require("kafkajs/src/protocol/error.js") as {
		errorCodes: { message: string }[];
	};
	const known = new Set(errorCodes.map((code) => code.message));
	for (const message of routineRefusalMessages()) {
		expect(known.has(message)).toBe(true);
	}
});

test("a producer that folds the refusal into its own message is lowered the same way", () => {
	const { sink, written } = recordingSink();
	const write = createKafkaLogCreator({ sink })(logLevel.INFO);
	write({
		namespace: "Producer",
		level: logLevel.ERROR,
		label: "ERROR",
		log: {
			timestamp: "t",
			message: `Failed to send messages: ${CONCURRENT_TRANSACTIONS}`,
			retryCount: 0,
			retryTime: 100,
		},
	});
	expect(written).toEqual([]);
});
