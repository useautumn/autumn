import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import { createMiscRedisRouter } from "@/external/redis/miscRedisRouting.js";

const asRedis = (value: object) => value as Redis;

describe("createMiscRedisRouter", () => {
	test("routes commands to whichever client resolve() returns at call time", async () => {
		const primary = {
			status: "ready",
			name: "primary",
			calls: [] as string[],
			async get(key: string) {
				this.calls.push(`get:${key}`);
				return null;
			},
			async set(key: string) {
				this.calls.push(`set:${key}`);
				return "OK";
			},
			async del(key: string) {
				this.calls.push(`del:${key}`);
				return 1;
			},
		};
		const fallback = {
			status: "ready",
			name: "fallback",
			calls: [] as string[],
			async get(key: string) {
				this.calls.push(`get:${key}`);
				return null;
			},
			async set(key: string) {
				this.calls.push(`set:${key}`);
				return "OK";
			},
			async del(key: string) {
				this.calls.push(`del:${key}`);
				return 1;
			},
		};
		let active = primary;
		const router = createMiscRedisRouter({ resolve: () => asRedis(active) });

		await router.get("secret_key:hash");
		active = fallback;
		await router.set("org:live:idempotency:hash", "1");
		await router.del("org:live:idempotency:hash");

		expect(primary.calls).toEqual(["get:secret_key:hash"]);
		expect(fallback.calls).toEqual([
			"set:org:live:idempotency:hash",
			"del:org:live:idempotency:hash",
		]);
	});
});
