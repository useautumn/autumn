import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startPollingLoop } from "@/queue/initWorkers.js";

const originalSetTimeout = globalThis.setTimeout;

const makeAbortError = () => {
	const error = new Error("aborted") as Error & { name: string };
	error.name = "AbortError";
	return error;
};

describe("startPollingLoop", () => {
	beforeEach(() => {
		globalThis.setTimeout = (((callback: TimerHandler) => {
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown) as typeof setTimeout;
	});

	afterEach(() => {
		globalThis.setTimeout = originalSetTimeout;
	});

	test("does not poll while the queue is disabled", async () => {
		let shouldPollCalls = 0;
		let sendCalls = 0;

		await startPollingLoop({
			db: {} as never,
			queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/track.fifo",
			isFifo: true,
			getSqsClientFn: () =>
				({
					send: async () => {
						sendCalls++;
						throw makeAbortError();
					},
				}) as never,
			recreateSqsClientFn: () =>
				({
					send: async () => {
						sendCalls++;
						throw makeAbortError();
					},
				}) as never,
			shouldPoll: () => {
				shouldPollCalls++;
				return shouldPollCalls > 1;
			},
		});

		expect(shouldPollCalls).toBeGreaterThan(1);
		expect(sendCalls).toBe(1);
	});

	test("polls immediately when the queue is enabled", async () => {
		let shouldPollCalls = 0;
		let sendCalls = 0;

		await startPollingLoop({
			db: {} as never,
			queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/primary.fifo",
			isFifo: true,
			getSqsClientFn: () =>
				({
					send: async () => {
						sendCalls++;
						throw makeAbortError();
					},
				}) as never,
			recreateSqsClientFn: () =>
				({
					send: async () => {
						sendCalls++;
						throw makeAbortError();
					},
				}) as never,
			shouldPoll: () => {
				shouldPollCalls++;
				return true;
			},
		});

		expect(shouldPollCalls).toBe(1);
		expect(sendCalls).toBe(1);
	});
});
