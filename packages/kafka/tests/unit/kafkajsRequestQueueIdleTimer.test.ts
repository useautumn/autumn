import { expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 re-arms a 1ms pending-request check on every idle connection:
// with nothing pending and no throttle the delay goes negative, setTimeout clamps
// it to 1ms, and the callback schedules the next one. Profiling a saturated
// balance worker put this loop at ~11% of its CPU. Patched in patches/kafkajs@2.2.4.patch.
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
