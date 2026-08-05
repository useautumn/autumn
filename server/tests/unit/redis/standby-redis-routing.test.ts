import { describe, expect, setSystemTime, test } from "bun:test";
import type { Redis } from "ioredis";
import {
	createStandbyRedisRouter,
	getStandbyRedisRouter,
} from "@/external/redis/initUtils/createStandbyRedisRouter.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";

type Listener = (...args: unknown[]) => void;

type FakeRedis = {
	status: string;
	calls: string[];
	listeners: Map<string, Set<Listener>>;
	failGetWith?: Error;
	hangGetForMs?: number;
	pipelineError?: Error;
	/** Resolve exec() with a per-command error tuple, as real ioredis does. */
	pipelineCommandError?: Error;
	emit: (event: string, ...args: unknown[]) => void;
	on: (event: string, handler: Listener) => void;
	once: (event: string, handler: Listener) => void;
	off: (event: string, handler: Listener) => void;
	disconnect: () => void;
	quit: () => Promise<"OK">;
	get: (key: string) => Promise<string>;
	set: (key: string, value: string) => Promise<"OK">;
	pipeline: () => {
		get: (key: string) => unknown;
		exec: () => Promise<[Error | null, string][]>;
	};
};

const asRedis = (redis: FakeRedis) => redis as unknown as Redis;

const connectionError = () => new Error("Connection is closed.");

const createFakeRedis = ({
	name,
	status = "ready",
	pipelineError,
}: {
	name: string;
	status?: string;
	pipelineError?: Error;
}): FakeRedis => {
	const calls: string[] = [];
	const listeners = new Map<string, Set<Listener>>();
	const onceWrappers = new Map<Listener, Listener>();

	const redis: FakeRedis = {
		status,
		calls,
		listeners,
		pipelineError,
		emit(event, ...args) {
			for (const handler of [...(listeners.get(event) ?? [])]) handler(...args);
		},
		on(event, handler) {
			calls.push(`on:${event}`);
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)?.add(handler);
		},
		once(event, handler) {
			calls.push(`once:${event}`);
			if (!listeners.has(event)) listeners.set(event, new Set());
			const wrapped: Listener = (...args) => {
				listeners.get(event)?.delete(wrapped);
				onceWrappers.delete(handler);
				handler(...args);
			};
			// Per-instance, as ioredis does: the same handler may be registered
			// on both connections and each needs its own wrapper.
			onceWrappers.set(handler, wrapped);
			listeners.get(event)?.add(wrapped);
		},
		off(event, handler) {
			calls.push(`off:${event}`);
			const wrapped = onceWrappers.get(handler);
			listeners.get(event)?.delete(handler);
			if (wrapped) {
				listeners.get(event)?.delete(wrapped);
				onceWrappers.delete(handler);
			}
		},
		disconnect() {
			calls.push("disconnect");
		},
		async quit() {
			calls.push("quit");
			return "OK";
		},
		async get(key) {
			calls.push(`get:${key}`);
			if (redis.hangGetForMs) {
				await new Promise((resolve) => setTimeout(resolve, redis.hangGetForMs));
			}
			if (redis.failGetWith) throw redis.failGetWith;
			return name;
		},
		async set(key, value) {
			calls.push(`set:${key}:${value}`);
			return "OK";
		},
		pipeline() {
			const keys: string[] = [];
			return {
				get(key: string) {
					keys.push(key);
					return this;
				},
				async exec() {
					calls.push(`pipeline:${keys.join(",")}`);
					if (redis.pipelineError) throw redis.pipelineError;
					return keys.map(
						(_key, index) =>
							(index === 0 && redis.pipelineCommandError
								? [redis.pipelineCommandError, null]
								: [null, name]) as [Error | null, string],
					);
				},
			};
		},
	};

	return redis;
};

const createPair = (options?: {
	primaryStatus?: string;
	standbyStatus?: string;
}) => {
	const primary = createFakeRedis({
		name: "primary",
		status: options?.primaryStatus,
	});
	const standby = createFakeRedis({
		name: "standby",
		status: options?.standbyStatus,
	});
	const redis = createStandbyRedisRouter({
		primary: asRedis(primary),
		standby: asRedis(standby),
	});
	return { primary, standby, redis };
};

describe("standby Redis routing", () => {
	test("sticks to the primary while it is usable", async () => {
		const { primary, standby, redis } = createPair();

		expect(await redis.get("customer")).toBe("primary");
		expect(await redis.set("customer", "value")).toBe("OK");
		expect(primary.calls).toEqual(["get:customer", "set:customer:value"]);
		expect(standby.calls).toEqual([]);
	});

	test("routes to the standby when the primary is not ready", async () => {
		const { primary, standby, redis } = createPair({
			primaryStatus: "reconnecting",
		});

		expect(redis.status).toBe("ready");
		expect(await redis.get("customer")).toBe("standby");
		expect(primary.calls).toEqual([]);
		expect(standby.calls).toEqual(["get:customer"]);
	});

	test("reports the primary status when neither connection is ready", () => {
		const { redis } = createPair({
			primaryStatus: "connecting",
			standbyStatus: "end",
		});

		expect(redis.status).toBe("connecting");
	});

	test("does not retry reads on its own", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		await expect(redis.get("customer")).rejects.toThrow(
			"Connection is closed.",
		);
		expect(primary.calls).toEqual(["get:customer"]);
		expect(standby.calls).toEqual([]);
	});

	test("does not retry writes whose outcome may be ambiguous", async () => {
		const { primary, standby, redis } = createPair();
		primary.set = async (key, value) => {
			primary.calls.push(`set:${key}:${value}`);
			throw connectionError();
		};

		await expect(redis.set("customer", "value")).rejects.toThrow(
			"Connection is closed.",
		);
		expect(primary.calls).toEqual(["set:customer:value"]);
		expect(standby.calls).toEqual([]);
	});

	test("registers listeners on both connections", () => {
		const { primary, standby, redis } = createPair();
		const seen: string[] = [];

		redis.on("error", (error) =>
			seen.push(`error:${(error as Error).message}`),
		);

		primary.emit("error", new Error("primary down"));
		standby.emit("error", new Error("standby down"));
		expect(seen).toEqual(["error:primary down", "error:standby down"]);
	});

	test("fires a once handler for a standby-only event, exactly once", () => {
		const { primary, standby, redis } = createPair();
		let readyCount = 0;

		redis.once("ready", () => {
			readyCount += 1;
		});

		// Standby first: a primary-only registration would never fire here.
		standby.emit("ready");
		expect(readyCount).toBe(1);

		primary.emit("ready");
		expect(readyCount).toBe(1);
	});

	test("closes both underlying connections during pool teardown", async () => {
		const { primary, standby, redis } = createPair();

		redis.disconnect();
		expect(primary.calls).toEqual(["disconnect"]);
		expect(standby.calls).toEqual(["disconnect"]);

		await redis.quit();
		expect(primary.calls).toEqual(["disconnect", "quit"]);
		expect(standby.calls).toEqual(["disconnect", "quit"]);
	});

	test("cancels a pending once handler through off", () => {
		const { primary, standby, redis } = createPair();
		let fired = 0;
		const handler = () => {
			fired += 1;
		};

		redis.once("ready", handler);
		redis.off("ready", handler);

		primary.emit("ready");
		standby.emit("ready");
		expect(fired).toBe(0);
	});

	test("returns the router from listener methods so calls chain", () => {
		const { redis } = createPair();

		expect(redis.on("error", () => {})).toBe(redis);
		expect(redis.once("ready", () => {})).toBe(redis);
	});

	test("assigns properties to both connections", () => {
		const { primary, standby, redis } = createPair();

		(redis as unknown as { marker: string }).marker = "set";
		expect((primary as unknown as { marker: string }).marker).toBe("set");
		expect((standby as unknown as { marker: string }).marker).toBe("set");
	});
});

describe("runRedisOp standby failover", () => {
	test("rebuilds and retries an idempotent pipeline on the standby", async () => {
		const primary = createFakeRedis({
			name: "primary",
			pipelineError: connectionError(),
		});
		const standby = createFakeRedis({ name: "standby" });
		const redis = createStandbyRedisRouter({
			primary: asRedis(primary),
			standby: asRedis(standby),
		});

		const result = await runRedisOp({
			redisInstance: redis,
			source: "standby-test",
			retryOnStandby: true,
			operation: (connection) =>
				connection.pipeline().get("subject").get("epoch").exec(),
		});

		expect(result?.map((entry) => entry[1])).toEqual(["standby", "standby"]);
		expect(primary.calls).toEqual(["pipeline:subject,epoch"]);
		expect(standby.calls).toEqual(["pipeline:subject,epoch"]);
	});

	test("fails over when exec resolves with a socket-level command tuple", async () => {
		const { primary, standby, redis } = createPair();
		primary.pipelineCommandError = connectionError();

		const result = await runRedisOp({
			redisInstance: redis,
			source: "standby-test",
			retryOnStandby: true,
			operation: async (connection) =>
				throwOnPipelineConnectionError(
					await connection.pipeline().get("subject").get("epoch").exec(),
				),
		});

		expect(result?.map((entry) => entry[1])).toEqual(["standby", "standby"]);
		expect(standby.calls).toEqual(["pipeline:subject,epoch"]);
	});

	test("keeps a deterministic command tuple as data", async () => {
		const { primary, standby, redis } = createPair();
		primary.pipelineCommandError = new Error(
			"WRONGTYPE Operation against a key",
		);

		const result = await runRedisOp({
			redisInstance: redis,
			source: "standby-test",
			retryOnStandby: true,
			operation: async (connection) =>
				throwOnPipelineConnectionError(
					await connection.pipeline().get("subject").get("epoch").exec(),
				),
		});

		expect(result?.[0]?.[0]?.message).toContain("WRONGTYPE");
		expect(standby.calls).toEqual([]);
	});

	test("makes a single attempt when retryOnStandby is not set", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual([]);
	});

	test("does not fail over on a deterministic command error", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = new Error("WRONGTYPE Operation against a key");

		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				retryOnStandby: true,
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual([]);
	});

	test("does not fail over when the alternate is not ready", async () => {
		const { primary, standby, redis } = createPair({ standbyStatus: "end" });
		primary.failGetWith = connectionError();

		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				retryOnStandby: true,
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual([]);
	});

	test("surfaces the retry failure when both connections fail", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();
		standby.failGetWith = connectionError();

		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				retryOnStandby: true,
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual(["get:subject"]);
	});

	test("shares one timeout budget across both attempts", async () => {
		const { primary, standby, redis } = createPair();
		// Primary burns most of the budget, then fails; standby never answers.
		primary.hangGetForMs = 200;
		primary.failGetWith = connectionError();
		standby.hangGetForMs = 5_000;

		const startedAt = Date.now();
		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				retryOnStandby: true,
				timeoutMs: 300,
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(standby.calls).toEqual(["get:subject"]);
		// A per-attempt budget would give the retry a fresh 300ms, landing at ~500ms.
		expect(Date.now() - startedAt).toBeLessThan(420);
	});

	test("skips the retry when the remaining budget cannot fit one", async () => {
		const { standby, redis } = createPair();
		const primaryRedis = getStandbyRedisRouter(redis)?.ordered()[0];
		expect(primaryRedis).toBeDefined();
		(primaryRedis as unknown as FakeRedis).hangGetForMs = 5_000;

		await expect(
			runRedisOp({
				redisInstance: redis,
				source: "standby-test",
				retryOnStandby: true,
				timeoutMs: 100,
				operation: (connection) => connection.get("subject"),
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);

		expect(standby.calls).toEqual([]);
	});
});

describe("standby Redis breaker", () => {
	const runFailingRead = async (redis: Redis) => {
		await runRedisOp({
			redisInstance: redis,
			source: "standby-test",
			retryOnStandby: true,
			operation: (connection) => connection.get("subject"),
		}).catch(() => undefined);
	};

	test("takes a half-open primary out of rotation", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) {
			await runFailingRead(redis);
		}

		// Still `ready` — only the failure record can demote it.
		expect(primary.status).toBe("ready");
		expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(standby));
	});

	test("ignores deterministic errors when demoting", async () => {
		const { primary, redis } = createPair();
		primary.failGetWith = new Error("WRONGTYPE Operation against a key");

		for (let attempt = 0; attempt < 5; attempt++) {
			await runFailingRead(redis);
		}

		expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(primary));
	});

	test("a deterministic reply clears the streak between timeouts", async () => {
		const { primary, redis } = createPair();

		// A WRONGTYPE between timeouts proves the socket round-tripped.
		for (let round = 0; round < 3; round++) {
			primary.failGetWith = connectionError();
			await runFailingRead(redis);
			primary.failGetWith = new Error("WRONGTYPE Operation against a key");
			await runFailingRead(redis);
		}

		expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(primary));
	});

	test("counts a failed pipeline exec against the connection", async () => {
		const { primary, standby, redis } = createPair();
		primary.pipelineError = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) {
			await redis
				.pipeline()
				.get("subject")
				.exec()
				.catch(() => undefined);
		}

		expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(standby));
	});

	test("restores the primary once the penalty window elapses", async () => {
		const { primary, redis } = createPair();
		primary.failGetWith = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) {
			await runFailingRead(redis);
		}
		expect(getStandbyRedisRouter(redis)?.ordered()[0]).not.toBe(
			asRedis(primary),
		);

		try {
			setSystemTime(new Date(Date.now() + 6_000));
			expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(primary));
		} finally {
			setSystemTime();
		}
	});

	test("clears the failure streak on a success", async () => {
		const { primary, standby, redis } = createPair();

		primary.failGetWith = connectionError();
		await runFailingRead(redis);
		await runFailingRead(redis);

		primary.failGetWith = undefined;
		await runFailingRead(redis);

		primary.failGetWith = connectionError();
		await runFailingRead(redis);
		await runFailingRead(redis);

		expect(getStandbyRedisRouter(redis)?.ordered()[0]).toBe(asRedis(primary));
		expect(standby.calls.length).toBeGreaterThan(0);
	});
});

describe("throwOnPipelineConnectionError", () => {
	test("raises a socket-level command error", () => {
		expect(() =>
			throwOnPipelineConnectionError([
				[null, "value"],
				[connectionError(), null],
			]),
		).toThrow("Connection is closed.");
	});

	test("passes a deterministic command error through as data", () => {
		const results: [Error | null, unknown][] = [
			[new Error("WRONGTYPE Operation against a key"), null],
			[null, "value"],
		];

		expect(throwOnPipelineConnectionError(results)).toBe(results);
	});

	test("passes a null result through", () => {
		expect(throwOnPipelineConnectionError(null)).toBeNull();
	});
});
