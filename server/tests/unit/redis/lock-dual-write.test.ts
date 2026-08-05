import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { Redis } from "ioredis";

type FakeRedis = {
	status: string;
	calls: string[];
	setResult: string | null;
	setShouldThrow: boolean;
	getResult: string | null;
	set: (...args: (string | number)[]) => Promise<string | null>;
	get: (key: string) => Promise<string | null>;
	del: (key: string) => Promise<number>;
	deleteOwnedLock: (key: string, token: string) => Promise<number>;
	refreshOwnedLock: (
		key: string,
		token: string,
		ttl: string,
	) => Promise<number>;
};

const fakeRedis = (): FakeRedis => ({
	status: "ready",
	calls: [],
	setResult: "OK",
	setShouldThrow: false,
	getResult: null,
	async set(...args) {
		if (this.setShouldThrow) throw new Error("set failed");
		this.calls.push(`set:${args.join(":")}`);
		return this.setResult;
	},
	async get(key) {
		this.calls.push(`get:${key}`);
		return this.getResult;
	},
	async del(key) {
		this.calls.push(`del:${key}`);
		return 1;
	},
	async deleteOwnedLock(key, token) {
		this.calls.push(`deleteOwnedLock:${key}:${token}`);
		return 1;
	},
	async refreshOwnedLock(key, token, ttl) {
		this.calls.push(`refreshOwnedLock:${key}:${token}:${ttl}`);
		return 1;
	},
});

let main = fakeRedis();
let backup = fakeRedis();

// Capture the real module before mocking so afterAll can restore it —
// bun's mock.module leaks across test files otherwise.
const realInstances = {
	...(await import("@/external/redis/miscCache/miscRedisInstances.js")),
};

mock.module("@/external/redis/miscCache/miscRedisInstances.js", () => ({
	getMiscMainRedis: () => main as unknown as Redis,
	getMiscBackupRedis: () => backup as unknown as Redis,
}));

import { getFromMiscRedisTargets } from "@/external/redis/miscCache/getFromMiscRedisTargets.js";
import { setOnMiscRedisTargets } from "@/external/redis/miscCache/setOnMiscRedisTargets.js";
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { refreshLockLease } from "@/external/redis/utils/lockUtils/refreshLockLease.js";
import { _setMiscRedisConfigForTesting } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";

const withRamp = () => {
	_setMiscRedisConfigForTesting({
		activeInstance: "main",
		ramp: { percent: 0, previousPercent: 0, changedAt: 0 },
	});
};

afterEach(() => {
	main = fakeRedis();
	backup = fakeRedis();
	_setMiscRedisConfigForTesting({});
});

afterAll(() => {
	mock.module(
		"@/external/redis/miscCache/miscRedisInstances.js",
		() => realInstances,
	);
});

describe("acquireLock dual-write", () => {
	test("mirrors a won lock to the ramp target as a plain SET (no NX)", async () => {
		withRamp();

		await acquireLock({ lockKey: "lock:x", ttlMs: 5000, token: "t1" });

		expect(main.calls[0]).toStartWith("set:lock:x:");
		expect(main.calls[0]).toEndWith(":PX:5000:NX");
		expect(backup.calls).toHaveLength(1);
		expect(backup.calls[0]).toEndWith(":PX:5000");
		expect(backup.calls[0]).not.toInclude(":NX");
	});

	test("writes only to the active instance when no ramp exists", async () => {
		await acquireLock({ lockKey: "lock:x", ttlMs: 5000, token: "t1" });

		expect(main.calls).toHaveLength(1);
		expect(backup.calls).toHaveLength(0);
	});

	test("does not mirror on conflict", async () => {
		withRamp();
		main.setResult = null;

		await expect(
			acquireLock({ lockKey: "lock:x", ttlMs: 5000, token: "t1" }),
		).rejects.toThrow();
		expect(backup.calls).toHaveLength(0);
	});

	test("a failed mirror write does not fail acquisition", async () => {
		withRamp();
		backup.setShouldThrow = true;

		const acquired = await acquireLock({
			lockKey: "lock:x",
			ttlMs: 5000,
			token: "t1",
		});
		expect(acquired).toBe(true);
	});
});

describe("clearLock dual-write", () => {
	test("releases the owned lock on every live target", async () => {
		withRamp();

		await clearLock({ lockKey: "lock:x", token: "t1" });

		expect(main.calls).toEqual(["deleteOwnedLock:lock:x:t1"]);
		expect(backup.calls).toEqual(["deleteOwnedLock:lock:x:t1"]);
	});

	test("skips targets that are not ready", async () => {
		withRamp();
		backup.status = "connecting";

		await clearLock({ lockKey: "lock:x" });

		expect(main.calls).toEqual(["del:lock:x"]);
		expect(backup.calls).toHaveLength(0);
	});
});

describe("refreshLockLease dual-write", () => {
	test("extends the lease on every live target", async () => {
		withRamp();

		await refreshLockLease({ lockKey: "lock:x", token: "t1", ttlMs: 9000 });

		expect(main.calls).toEqual(["refreshOwnedLock:lock:x:t1:9000"]);
		expect(backup.calls).toEqual(["refreshOwnedLock:lock:x:t1:9000"]);
	});
});

describe("setOnMiscRedisTargets", () => {
	test("write-through lands on every live target during a ramp", async () => {
		withRamp();

		await setOnMiscRedisTargets({
			key: "sub:x",
			value: "v",
			ttlMs: 60000,
			source: "test:set",
		});

		expect(main.calls).toEqual(["set:sub:x:v:PX:60000"]);
		expect(backup.calls).toEqual(["set:sub:x:v:PX:60000"]);
	});

	test("writes only to the active instance when no ramp exists", async () => {
		await setOnMiscRedisTargets({
			key: "sub:x",
			value: "v",
			ttlMs: 60000,
			source: "test:set",
		});

		expect(main.calls).toEqual(["set:sub:x:v:PX:60000"]);
		expect(backup.calls).toHaveLength(0);
	});
});

describe("getFromMiscRedisTargets", () => {
	test("returns the active instance's value without querying the ramp target", async () => {
		withRamp();
		main.getResult = "from-main";

		const value = await getFromMiscRedisTargets({
			key: "sub:x",
			source: "test:get",
		});

		expect(value).toBe("from-main");
		expect(backup.calls).toHaveLength(0);
	});

	test("falls back to the ramp target when the active instance misses", async () => {
		withRamp();
		backup.getResult = "from-backup";

		const value = await getFromMiscRedisTargets({
			key: "sub:x",
			source: "test:get",
		});

		expect(value).toBe("from-backup");
		expect(main.calls).toEqual(["get:sub:x"]);
		expect(backup.calls).toEqual(["get:sub:x"]);
	});

	test("returns null when no live target has the value", async () => {
		withRamp();

		const value = await getFromMiscRedisTargets({
			key: "sub:x",
			source: "test:get",
		});

		expect(value).toBeNull();
	});
});
