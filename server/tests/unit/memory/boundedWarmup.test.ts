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

	// The init path observes the warmup with a no-op catch, then consumes it
	// ticks later — that must still report "failed", never unhandledRejection.
	test("pre-observed early rejection still reports 'failed' when consumed late", async () => {
		let unhandled = 0;
		const onUnhandled = () => {
			unhandled += 1;
		};
		process.on("unhandledRejection", onUnhandled);
		try {
			const warmup = Promise.reject(new Error("bad redis config"));
			void warmup.catch(() => {});
			await Bun.sleep(20);
			const result = await awaitBoundedWarmup({
				warmup,
				timeoutMs: 1_000,
				log: () => {},
			});
			expect(result).toBe("failed");
			expect(unhandled).toBe(0);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});
});
