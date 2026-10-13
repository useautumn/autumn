import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import type { QueueSendResult } from "@alienplatform/bindings";
import {
	AtomQueueBackoffError,
	createAtomPushQueue,
} from "../../../src/atom/queue/createAtomPushQueue.js";

const START = new Date("2026-10-13T07:40:00.000Z");

const statusError = () =>
	Object.assign(
		new Error(
			"The customer's storage connection is not ready for Remote Bindings: deployment status is 'update-failed'",
		),
		{ name: "AlienError", code: "REMOTE_BINDINGS_CUSTOMER_RESOURCE_NOT_READY" },
	);

const advanceBy = (ms: number) => setSystemTime(new Date(Date.now() + ms));

/** A queue whose opens and sends fail while `failOpens`/`failSends` say so, counting each call. */
const createQueue = () => {
	const state = { failOpens: 0, failSends: 0, opens: 0, sends: 0 };
	const logs: { level: string; type: string; data: unknown }[] = [];
	const log =
		(level: string) =>
		(fields: unknown): void => {
			const { type, data } = fields as { type: string; data: unknown };
			logs.push({ level, type, data });
		};
	const pushQueue = createAtomPushQueue({
		openQueue: async () => {
			state.opens += 1;
			if (state.failOpens > 0) {
				state.failOpens -= 1;
				throw statusError();
			}
			return {
				sendBatchText: async (bodies: string[]) => {
					state.sends += 1;
					if (state.failSends > 0) {
						state.failSends -= 1;
						throw statusError();
					}
					return bodies.map((): QueueSendResult => ({ status: "sent" }));
				},
			};
		},
		logger: { warn: log("warn"), info: log("info") },
	});
	const push = () => pushQueue.send({ payload: "{}" });
	return { state, logs, push };
};

afterEach(() => {
	setSystemTime();
});

describe("Atom push queue", () => {
	test("a failed open is not retried until the backoff passes, then the queue opens and sends", async () => {
		setSystemTime(START);
		const { state, logs, push } = createQueue();
		state.failOpens = 1;

		await expect(push()).rejects.toThrow(
			"deployment status is 'update-failed'",
		);
		await expect(push()).rejects.toBeInstanceOf(AtomQueueBackoffError);
		expect(state.opens).toBe(1);

		advanceBy(1_000);
		await push();

		expect(state.opens).toBe(2);
		expect(state.sends).toBe(1);
		expect(logs).toEqual([
			{
				level: "warn",
				type: "herald_atom_queue_unavailable",
				data: { failures: 1, retryInMs: 1_000, failedFast: 0 },
			},
			{
				level: "info",
				type: "herald_atom_queue_recovered",
				data: { failures: 1, failedFast: 1 },
			},
		]);
	});

	test("an Alien status error after a successful open keeps the opened queue and sends through it again", async () => {
		setSystemTime(START);
		const { state, push } = createQueue();

		await push();
		state.failSends = 1;
		await expect(push()).rejects.toThrow(
			"deployment status is 'update-failed'",
		);

		advanceBy(1_000);
		await push();
		await push();

		expect(state.opens).toBe(1);
		expect(state.sends).toBe(4);
	});

	test("each failed try doubles the wait up to 30 s, and pushes inside it never reach Alien", async () => {
		setSystemTime(START);
		const { state, logs, push } = createQueue();
		state.failOpens = Number.POSITIVE_INFINITY;

		const waits = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
		await expect(push()).rejects.toThrow("update-failed");
		for (const waitMs of waits.slice(0, -1)) {
			advanceBy(waitMs - 1);
			await expect(push()).rejects.toBeInstanceOf(AtomQueueBackoffError);
			advanceBy(1);
			await expect(push()).rejects.toThrow("update-failed");
		}

		expect(state.opens).toBe(waits.length);
		expect(
			logs.map((entry) => (entry.data as { retryInMs: number }).retryInMs),
		).toEqual(waits);
	});

	test("batches failing together move the backoff once", async () => {
		setSystemTime(START);
		const { state, logs, push } = createQueue();
		await push();
		state.failSends = 2;

		const concurrent = Array.from({ length: 20 }, () => push());
		const settled = await Promise.allSettled(concurrent);

		expect(settled.every((result) => result.status === "rejected")).toBe(true);
		expect(state.sends).toBe(3);
		expect(logs).toHaveLength(1);
		expect(logs[0]?.data).toEqual({
			failures: 1,
			retryInMs: 1_000,
			failedFast: 0,
		});
	});
});
