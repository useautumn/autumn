import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import {
	createMainRedisRouter,
	selectMainRedisClient,
} from "@/external/redis/mainRedisRouting.js";
import { MainRedisCacheConfigSchema } from "@/internal/misc/mainRedisCache/mainRedisCacheSchemas.js";

const asRedis = (value: object) => value as Redis;

describe("main Redis routing", () => {
	test("defaults edge config to primary", () => {
		expect(MainRedisCacheConfigSchema.parse({})).toEqual({
			activeInstance: "primary",
		});
	});

	test("selects primary by default", () => {
		const primary = asRedis({});
		const fallback = asRedis({});

		expect(
			selectMainRedisClient({
				activeInstance: "primary",
				primary: () => primary,
				fallback,
			}),
		).toBe(primary);
	});

	test("selects fallback when configured", () => {
		const primary = asRedis({});
		const fallback = asRedis({});

		expect(
			selectMainRedisClient({
				activeInstance: "fallback",
				primary: () => primary,
				fallback,
			}),
		).toBe(fallback);
	});

	test("fails safely to primary when fallback is missing", () => {
		const primary = asRedis({});

		expect(
			selectMainRedisClient({
				activeInstance: "fallback",
				primary: () => primary,
				fallback: null,
			}),
		).toBe(primary);
	});

	test("routes auth and idempotency commands to the current client", async () => {
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
		const router = createMainRedisRouter({ resolve: () => asRedis(active) });

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
