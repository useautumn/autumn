import { expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.resolve("kafkajs"));
const Connection = require("./src/network/connection.js");
const {
	KafkaJSConnectionError,
	KafkaJSRequestTimeoutError,
} = require("./src/errors.js");

type Warning = { message: string; extra: Record<string, unknown> };
type Outcome = { error?: Error; value?: unknown };

function createConnection() {
	const warnings: Warning[] = [];
	const socket = { ended: false };
	const logger = {
		namespace: () => ({
			debug() {},
			info() {},
			error() {},
			warn(message: string, extra: Record<string, unknown>) {
				warnings.push({ message, extra });
			},
		}),
	};
	const connection = new Connection({
		host: "lkc-test-g001.example",
		port: 9092,
		logger,
		socketFactory: () => {
			throw new Error("no socket in this test");
		},
		requestTimeout: 20,
		enforceRequestTimeout: true,
		connectionTimeout: 1_000,
		clientId: "test",
	});
	connection.connectionStatus = "connected";
	connection.socket = {
		end() {
			socket.ended = true;
		},
		unref() {},
	};
	return { connection, warnings, socket };
}

function sendRequest({
	connection,
	correlationId,
	apiName,
	requestTimeout,
}: {
	connection: InstanceType<typeof Connection>;
	correlationId: number;
	apiName: string;
	requestTimeout?: number;
}): Outcome {
	const outcome: Outcome = {};
	connection.requestQueue.push({
		entry: {
			correlationId,
			apiName,
			apiKey: 0,
			apiVersion: 7,
			resolve: (value: unknown) => {
				outcome.value = value;
			},
			reject: (error: Error) => {
				outcome.error = error;
			},
		},
		expectResponse: true,
		requestTimeout,
		sendRequest: () => {},
	});
	return outcome;
}

async function waitFor(condition: () => boolean) {
	const deadline = Date.now() + 2_000;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("condition never held");
		await Bun.sleep(10);
	}
}

test("a timed-out request closes the connection so the next request reconnects", async () => {
	const { connection, warnings, socket } = createConnection();
	const timedOut = sendRequest({
		connection,
		correlationId: 1,
		apiName: "Produce",
	});
	const longPoll = sendRequest({
		connection,
		correlationId: 2,
		apiName: "Fetch",
		requestTimeout: 60_000,
	});
	connection.requestQueue.scheduleRequestTimeoutCheck();

	await waitFor(() => !connection.isConnected());

	expect(timedOut.error).toBeInstanceOf(KafkaJSRequestTimeoutError);
	expect(longPoll.error).toBeInstanceOf(KafkaJSConnectionError);
	expect(socket.ended).toBe(true);
	expect(warnings).toEqual([
		{
			message:
				"Request timed out; closing the connection so the next request reconnects",
			extra: expect.objectContaining({
				broker: "lkc-test-g001.example:9092",
				apiName: "Produce",
				correlationId: 1,
			}),
		},
	]);
});

test("a request answered in time leaves the connection open", async () => {
	const { connection, warnings } = createConnection();
	const answered = sendRequest({
		connection,
		correlationId: 1,
		apiName: "Produce",
	});
	connection.requestQueue.fulfillRequest({
		correlationId: 1,
		payload: Buffer.alloc(0),
		size: 0,
	});
	connection.requestQueue.scheduleRequestTimeoutCheck();
	await Bun.sleep(120);
	connection.requestQueue.destroy();

	expect(answered.error).toBeUndefined();
	expect(connection.isConnected()).toBe(true);
	expect(warnings).toEqual([]);
});
