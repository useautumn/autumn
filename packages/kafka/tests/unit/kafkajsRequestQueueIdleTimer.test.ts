import { expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.resolve("kafkajs"));
const RequestQueue = require("./src/network/requestQueue/index.js");

function createQueue() {
	return new RequestQueue({
		instrumentationEmitter: null,
		maxInFlightRequests: null,
		requestTimeout: 30_000,
		enforceRequestTimeout: true,
		clientId: "test",
		broker: "localhost:9092",
		logger: { debug() {}, warn() {}, error() {}, info() {} },
		isConnected: () => true,
	});
}

test("an idle, unthrottled request queue schedules no pending-request check", () => {
	const queue = createQueue();
	queue.scheduleCheckPendingRequests();
	const scheduled = queue.throttleCheckTimeoutId;
	queue.destroy?.();
	expect(scheduled).toBeNull();
});

test("a throttled request queue still schedules its check for when the throttle ends", () => {
	const queue = createQueue();
	queue.throttledUntil = Date.now() + 50;
	queue.scheduleCheckPendingRequests();
	const scheduled = queue.throttleCheckTimeoutId;
	clearTimeout(scheduled);
	expect(scheduled).not.toBeNull();
});
