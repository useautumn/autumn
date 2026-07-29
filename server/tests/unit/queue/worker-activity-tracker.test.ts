import { describe, expect, test } from "bun:test";
import { createWorkerActivityTracker } from "@/queue/workerActivityTracker.js";

const IDLE_AFTER_MS = 5 * 60 * 1000;

describe("worker activity tracker", () => {
	test("activity from any queue resets the process-wide idle timer", () => {
		let now = 0;
		const tracker = createWorkerActivityTracker({
			idleAfterMs: IDLE_AFTER_MS,
			now: () => now,
		});

		tracker.recordMessagesReceived({ count: 1 });
		now += 4 * 60 * 1000;
		tracker.recordMessagesReceived({ count: 2 });
		now += 2 * 60 * 1000;

		expect(tracker.getIdleStatus()).toMatchObject({
			shouldRecycle: false,
			totalMessagesReceived: 3,
		});

		now += 3 * 60 * 1000;
		expect(tracker.getIdleStatus()).toMatchObject({
			idleForMs: IDLE_AFTER_MS,
			shouldRecycle: true,
		});
	});

	test("does not recycle while work or acknowledgements are active", () => {
		let now = 0;
		const tracker = createWorkerActivityTracker({
			idleAfterMs: IDLE_AFTER_MS,
			now: () => now,
		});

		tracker.recordMessagesReceived({ count: 1 });
		tracker.startWork();
		now += IDLE_AFTER_MS;

		expect(tracker.getIdleStatus().shouldRecycle).toBe(false);

		tracker.finishWork();
		expect(tracker.getIdleStatus().shouldRecycle).toBe(true);
	});

	test("does not recycle a process that has never received a message", () => {
		let now = IDLE_AFTER_MS * 2;
		const tracker = createWorkerActivityTracker({
			idleAfterMs: IDLE_AFTER_MS,
			now: () => now,
		});

		expect(tracker.getIdleStatus()).toEqual({
			activeWorkCount: 0,
			idleForMs: 0,
			shouldRecycle: false,
			totalMessagesReceived: 0,
		});

		now += IDLE_AFTER_MS;
		expect(tracker.getIdleStatus().shouldRecycle).toBe(false);
	});
});
