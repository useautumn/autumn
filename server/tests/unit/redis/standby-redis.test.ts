import { describe, expect, setSystemTime, test } from "bun:test";
import type { Redis } from "ioredis";
import {
	getStandbyRedisPair,
	isRedisReadyWithStandby,
	redisStatusWithStandby,
	registerStandbyRedis,
} from "@/external/redis/initUtils/standbyRedis.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";

type FakeRedis = {
	status: string;
	calls: string[];
	failGetWith?: Error;
	hangGetForMs?: number;
	pipelineCommandError?: Error;
	get: (key: string) => Promise<string>;
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
}: {
	name: string;
	status?: string;
}): FakeRedis => {
	const calls: string[] = [];
	const redis: FakeRedis = {
		status,
		calls,
		async get(key) {
			calls.push(`get:${key}`);
			if (redis.hangGetForMs) {
				await new Promise((resolve) => setTimeout(resolve, redis.hangGetForMs));
			}
			if (redis.failGetWith) throw redis.failGetWith;
			return name;
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
	const redis = registerStandbyRedis({
		primary: asRedis(primary),
		standby: asRedis(standby),
	});
	return { primary, standby, redis };
};

const readSubject = (redis: Redis, options?: { timeoutMs?: number }) =>
	runRedisOp({
		redisInstance: redis,
		source: "standby-test",
		retryOnStandby: true,
		timeoutMs: options?.timeoutMs,
		operation: (connection) => connection.get("subject"),
	});

describe("standby pairing", () => {
	test("returns the primary so call sites keep a plain client", () => {
		const { primary, redis } = createPair();

		expect(redis).toBe(asRedis(primary));
	});

	test("reports ready while either connection can serve", () => {
		const { redis } = createPair({ primaryStatus: "reconnecting" });

		expect(redisStatusWithStandby(redis)).toBe("ready");
		expect(isRedisReadyWithStandby(redis)).toBe(true);
	});

	test("reports the primary status when neither is ready", () => {
		const { redis } = createPair({
			primaryStatus: "connecting",
			standbyStatus: "end",
		});

		expect(redisStatusWithStandby(redis)).toBe("connecting");
		expect(isRedisReadyWithStandby(redis)).toBe(false);
	});

	test("leaves an unpaired client's status untouched", () => {
		const plain = createFakeRedis({ name: "plain", status: "reconnecting" });

		expect(getStandbyRedisPair(asRedis(plain))).toBeUndefined();
		expect(redisStatusWithStandby(asRedis(plain))).toBe("reconnecting");
	});

	test("prefers the primary while it is usable", () => {
		const { primary, redis } = createPair();

		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(primary));
	});

	test("prefers the standby when the primary is not ready", () => {
		const { standby, redis } = createPair({ primaryStatus: "reconnecting" });

		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(standby));
	});
});

describe("runRedisOp standby failover", () => {
	test("retries a connection-level read failure on the standby", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		expect(await readSubject(redis)).toBe("standby");
		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual(["get:subject"]);
	});

	test("rebuilds a pipeline against the standby", async () => {
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

		await expect(readSubject(redis)).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(standby.calls).toEqual([]);
	});

	test("does not fail over when the standby is not ready", async () => {
		const { primary, standby, redis } = createPair({ standbyStatus: "end" });
		primary.failGetWith = connectionError();

		await expect(readSubject(redis)).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(standby.calls).toEqual([]);
	});

	test("surfaces the failure when both connections fail", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();
		standby.failGetWith = connectionError();

		await expect(readSubject(redis)).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(primary.calls).toEqual(["get:subject"]);
		expect(standby.calls).toEqual(["get:subject"]);
	});

	test("runs when only the standby is ready", async () => {
		const { primary, standby, redis } = createPair({
			primaryStatus: "reconnecting",
		});

		expect(await readSubject(redis)).toBe("standby");
		expect(primary.calls).toEqual([]);
	});

	test("shares one timeout budget across both attempts", async () => {
		const { primary, standby, redis } = createPair();
		primary.hangGetForMs = 200;
		primary.failGetWith = connectionError();
		standby.hangGetForMs = 5_000;

		const startedAt = Date.now();
		await expect(readSubject(redis, { timeoutMs: 300 })).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);

		expect(standby.calls).toEqual(["get:subject"]);
		// A per-attempt budget would give the retry a fresh 300ms, landing at ~500ms.
		expect(Date.now() - startedAt).toBeLessThan(420);
	});

	test("skips the retry when the remaining budget cannot fit one", async () => {
		const { primary, standby, redis } = createPair();
		primary.hangGetForMs = 5_000;

		await expect(readSubject(redis, { timeoutMs: 100 })).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(standby.calls).toEqual([]);
	});
});

describe("standby breaker", () => {
	const failRead = (redis: Redis) => readSubject(redis).catch(() => undefined);

	test("takes a half-open primary out of rotation", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) await failRead(redis);

		// Still `ready` — only the failure record can demote it.
		expect(primary.status).toBe("ready");
		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(standby));
	});

	test("skips the dead primary entirely once demoted", async () => {
		const { primary, standby, redis } = createPair();
		primary.failGetWith = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) await failRead(redis);
		const callsBefore = primary.calls.length;

		expect(await readSubject(redis)).toBe("standby");
		expect(primary.calls.length).toBe(callsBefore);
	});

	test("ignores deterministic errors when demoting", async () => {
		const { primary, redis } = createPair();
		primary.failGetWith = new Error("WRONGTYPE Operation against a key");

		for (let attempt = 0; attempt < 5; attempt++) await failRead(redis);

		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(primary));
	});

	test("a deterministic reply clears the streak between timeouts", async () => {
		const { primary, redis } = createPair();

		for (let round = 0; round < 3; round++) {
			primary.failGetWith = connectionError();
			await failRead(redis);
			primary.failGetWith = new Error("WRONGTYPE Operation against a key");
			await failRead(redis);
		}

		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(primary));
	});

	test("restores the primary once the penalty window elapses", async () => {
		const { primary, redis } = createPair();
		primary.failGetWith = connectionError();

		for (let attempt = 0; attempt < 3; attempt++) await failRead(redis);
		expect(getStandbyRedisPair(redis)?.ordered()[0]).not.toBe(asRedis(primary));

		try {
			setSystemTime(new Date(Date.now() + 6_000));
			expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(primary));
		} finally {
			setSystemTime();
		}
	});

	test("clears the failure streak on a success", async () => {
		const { primary, redis } = createPair();

		primary.failGetWith = connectionError();
		await failRead(redis);
		await failRead(redis);

		primary.failGetWith = undefined;
		await failRead(redis);

		primary.failGetWith = connectionError();
		await failRead(redis);
		await failRead(redis);

		expect(getStandbyRedisPair(redis)?.ordered()[0]).toBe(asRedis(primary));
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
