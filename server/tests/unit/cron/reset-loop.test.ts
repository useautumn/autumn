import { describe, expect, test } from "bun:test";
import { RESET_BATCH_SIZE } from "@/cron/resetCron/runResetBatch.js";
import { runResetLoop } from "@/cron/resetCron/runResetLoop.js";
import type { CronContext } from "@/cron/utils/CronContext.js";

const ctx = {
	db: {},
	logger: {
		error: () => undefined,
	},
} as unknown as CronContext;

describe("reset loop", () => {
	test("does no work while disabled", async () => {
		const controller = new AbortController();
		let batches = 0;
		const delays: number[] = [];

		await runResetLoop({
			ctx,
			signal: controller.signal,
			isEnabled: () => false,
			isActive: () => true,
			runBatch: async () => {
				batches++;
				return { fetched: 0, upserted: 0, durationMs: 0 };
			},
			wait: async ({ delayMs }) => {
				delays.push(delayMs);
				controller.abort();
			},
		});

		expect(batches).toBe(0);
		expect(delays).toEqual([5_000]);
	});

	test("awaits each batch and drains full pages faster", async () => {
		const controller = new AbortController();
		const delays: number[] = [];
		let batches = 0;
		let activeBatches = 0;
		let maxActiveBatches = 0;

		await runResetLoop({
			ctx,
			signal: controller.signal,
			isEnabled: () => true,
			isActive: () => true,
			runBatch: async () => {
				batches++;
				activeBatches++;
				maxActiveBatches = Math.max(maxActiveBatches, activeBatches);
				await Promise.resolve();
				activeBatches--;
				return {
					fetched: batches === 1 ? RESET_BATCH_SIZE : 1,
					upserted: 0,
					durationMs: 0,
				};
			},
			wait: async ({ delayMs }) => {
				delays.push(delayMs);
				if (delays.length === 2) controller.abort();
			},
		});

		expect(batches).toBe(2);
		expect(maxActiveBatches).toBe(1);
		expect(delays).toEqual([1_000, 5_000]);
	});

	test("does no work on the idle blue-green slot", async () => {
		const controller = new AbortController();
		let batches = 0;

		await runResetLoop({
			ctx,
			signal: controller.signal,
			isEnabled: () => true,
			isActive: () => false,
			runBatch: async () => {
				batches++;
				return { fetched: 0, upserted: 0, durationMs: 0 };
			},
			wait: async () => controller.abort(),
		});

		expect(batches).toBe(0);
	});
});
