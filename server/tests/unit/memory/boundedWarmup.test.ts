import { describe, expect, test } from "bun:test";
import { awaitBoundedWarmup } from "@/external/redis/initUtils/boundedWarmup.js";

describe("awaitBoundedWarmup", () => {
	test("returns 'warm' when the warmup resolves within the bound", async () => {
		const result = await awaitBoundedWarmup({
			warmup: Promise.resolve(),
			timeoutMs: 1_000,
			log: () => {},
		});
		expect(result).toBe("warm");
	});

	test("proceeds at the bound when the warmup hangs, and logs", async () => {
		const logs: string[] = [];
		const never = new Promise<void>(() => {});
		const started = Date.now();
		const result = await awaitBoundedWarmup({
			warmup: never,
			timeoutMs: 50,
			log: (message) => logs.push(message),
		});
		expect(result).toBe("timeout");
		expect(Date.now() - started).toBeGreaterThanOrEqual(45);
		expect(logs.length).toBe(1);
	});

	test("proceeds without throwing when the warmup rejects", async () => {
		const logs: string[] = [];
		const result = await awaitBoundedWarmup({
			warmup: Promise.reject(new Error("redis down")),
			timeoutMs: 1_000,
			log: (message) => logs.push(message),
		});
		expect(result).toBe("failed");
		expect(logs.length).toBe(1);
	});
});
