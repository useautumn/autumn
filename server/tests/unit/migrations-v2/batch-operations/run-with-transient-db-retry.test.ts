import { describe, expect, test } from "bun:test";
import { runWithTransientDbRetry } from "@/internal/migrations/v2/batchOperations/execute/utils/runWithTransientDbRetry.js";

const connectionDropped = () =>
	new Error("Connection terminated unexpectedly");

describe("runWithTransientDbRetry", () => {
	test("returns the first success without retrying", async () => {
		let calls = 0;
		const result = await runWithTransientDbRetry({
			maxAttempts: 3,
			delayMs: 0,
			run: async () => {
				calls++;
				return "ok";
			},
		});
		expect(result).toBe("ok");
		expect(calls).toBe(1);
	});

	test("retries a dropped connection then succeeds", async () => {
		let calls = 0;
		const retries: number[] = [];
		const result = await runWithTransientDbRetry({
			maxAttempts: 3,
			delayMs: 0,
			onRetry: ({ attempt }) => {
				retries.push(attempt);
			},
			run: async () => {
				calls++;
				if (calls === 1) throw connectionDropped();
				return "recovered";
			},
		});
		expect(result).toBe("recovered");
		expect(calls).toBe(2);
		expect(retries).toEqual([1]);
	});

	test("does not retry an application error", async () => {
		let calls = 0;
		const attempt = runWithTransientDbRetry({
			maxAttempts: 3,
			delayMs: 0,
			run: async () => {
				calls++;
				throw new Error("unique constraint");
			},
		});
		expect(attempt).rejects.toThrow("unique constraint");
		await attempt.catch(() => {});
		expect(calls).toBe(1);
	});

	test("retries a drizzle-wrapped connection drop", async () => {
		let calls = 0;
		const wrapped = () => {
			const error = new Error("Failed query: select 1\nparams: []");
			error.cause = connectionDropped();
			return error;
		};
		const result = await runWithTransientDbRetry({
			maxAttempts: 3,
			delayMs: 0,
			run: async () => {
				calls++;
				if (calls === 1) throw wrapped();
				return "recovered";
			},
		});
		expect(result).toBe("recovered");
		expect(calls).toBe(2);
	});

	test("throws the last transient error after maxAttempts", async () => {
		let calls = 0;
		const attempt = runWithTransientDbRetry({
			maxAttempts: 3,
			delayMs: 0,
			run: async () => {
				calls++;
				throw connectionDropped();
			},
		});
		expect(attempt).rejects.toThrow("Connection terminated unexpectedly");
		await attempt.catch(() => {});
		expect(calls).toBe(3);
	});
});
