import { describe, expect, test } from "bun:test";
import { BalanceWorkerThreadsEdgeConfigSchema } from "../../src/edgeConfig.js";

describe("balance worker threads edge config", () => {
	test("an empty file lays out one HTTP worker with 4 MiB request and 16 MiB reply rings, and a 4 MiB send ring", () => {
		expect(BalanceWorkerThreadsEdgeConfigSchema.parse({})).toEqual({
			httpWorkers: 1,
			requestRingBytes: 4 << 20,
			replyRingBytes: 16 << 20,
			sendRingBytes: 4 << 20,
		});
	});

	test("a ring size that is not a power of two, or a knob it does not know, is refused", () => {
		expect(
			BalanceWorkerThreadsEdgeConfigSchema.safeParse({
				replyRingBytes: 3 << 20,
			}).success,
		).toBe(false);
		expect(
			BalanceWorkerThreadsEdgeConfigSchema.safeParse({ ioWorkers: 2 }).success,
		).toBe(false);
	});
});
