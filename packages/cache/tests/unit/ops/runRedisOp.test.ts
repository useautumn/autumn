import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import { createRedisClient } from "../../../src/client/createRedisClient.js";
import { RedisUnavailableError } from "../../../src/ops/redisErrors.js";
import { runRedisOp, tryRedisOp } from "../../../src/ops/runRedisOp.js";
import { tryRedisNx } from "../../../src/ops/tryRedisNx.js";

const fakeRedis = ({ status = "ready" }: { status?: string } = {}): Redis =>
	({ status }) as unknown as Redis;

describe("runRedisOp", () => {
	test("a client that is not ready fails at once, as not_ready", async () => {
		await expect(
			runRedisOp({
				operation: async () => "never",
				source: "test:not-ready",
				redisInstance: fakeRedis({ status: "connecting" }),
			}),
		).rejects.toMatchObject({
			name: "RedisUnavailableError",
			reason: "not_ready",
		});
	});

	test("a budget shorter than the command classifies as timeout; a closed socket as connection", async () => {
		await expect(
			runRedisOp({
				operation: () => new Promise<string>(() => undefined),
				source: "test:budget",
				redisInstance: fakeRedis(),
				timeoutMs: 10,
			}),
		).rejects.toMatchObject({ reason: "timeout" });
		await expect(
			runRedisOp({
				operation: async () => {
					throw new Error("Connection is closed.");
				},
				source: "test:closed",
				redisInstance: fakeRedis(),
			}),
		).rejects.toMatchObject({ reason: "connection" });
	});

	test("tryRedisOp fails open: undefined and onError, never a throw", async () => {
		const seen: unknown[] = [];
		const value = await tryRedisOp({
			operation: async () => {
				throw new Error("ECONNRESET");
			},
			source: "test:fail-open",
			redisInstance: fakeRedis(),
			onError: (error) => seen.push(error),
		});
		expect(value).toBeUndefined();
		expect(seen[0]).toBeInstanceOf(RedisUnavailableError);
	});

	test("the warning goes to the logger the client was created with, once per 30s", async () => {
		const warnings: string[] = [];
		const redis = createRedisClient({
			ctx: {
				logger: {
					info: () => undefined,
					warn: (...args) => warnings.push(String(args.at(-1))),
					error: () => undefined,
				},
			},
			config: {
				url: "redis://127.0.0.1:1",
				label: "test",
				commandTimeoutMs: 50,
				maxRetriesPerRequest: 0,
			},
		});
		try {
			for (let attempt = 0; attempt < 3; attempt++) {
				await tryRedisOp({
					operation: async () => "never",
					source: "test:warn-once",
					redisInstance: redis,
				});
			}
			expect(warnings).toEqual(["[redis] operation unavailable"]);
		} finally {
			redis.disconnect();
		}
	});
});

describe("tryRedisNx", () => {
	test("OK claims, null means the key exists, a failure is unavailable", async () => {
		const outcomes = {
			onSuccess: () => "claimed",
			onKeyAlreadyExists: () => "exists",
			onRedisUnavailable: () => "down",
		};
		expect(
			await tryRedisNx({
				operation: async () => "OK" as const,
				source: "test:nx",
				redisInstance: fakeRedis(),
				...outcomes,
			}),
		).toBe("claimed");
		expect(
			await tryRedisNx({
				operation: async () => null,
				source: "test:nx",
				redisInstance: fakeRedis(),
				...outcomes,
			}),
		).toBe("exists");
		expect(
			await tryRedisNx({
				operation: async () => {
					throw new Error("Command timed out");
				},
				source: "test:nx",
				redisInstance: fakeRedis(),
				...outcomes,
			}),
		).toBe("down");
	});
});
