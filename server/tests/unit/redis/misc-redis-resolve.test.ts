import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { Redis } from "ioredis";

const fakeRedis = (name: string): Redis =>
	({ status: "ready", _name: name }) as unknown as Redis;

const main = fakeRedis("main");
const backup = fakeRedis("backup");

// Capture the real module before mocking so afterAll can restore it —
// bun's mock.module leaks across test files otherwise.
const realInstances = {
	...(await import("@/external/redis/miscCache/miscRedisInstances.js")),
};

const instanceState = { backupConfigured: true };

mock.module("@/external/redis/miscCache/miscRedisInstances.js", () => ({
	getMiscMainRedis: () => main,
	getMiscBackupRedis: () => (instanceState.backupConfigured ? backup : null),
}));

import {
	forEachMiscRedisTarget,
	getMiscRedisTargets,
	getRequestBucket,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { _setMiscRedisConfigForTesting } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";

const rampAt = (percent: number) => ({
	percent,
	previousPercent: 0,
	changedAt: 0,
});

afterEach(() => {
	instanceState.backupConfigured = true;
	_setMiscRedisConfigForTesting({});
});

afterAll(() => {
	mock.module(
		"@/external/redis/miscCache/miscRedisInstances.js",
		() => realInstances,
	);
});

/** Deterministically find a requestId whose bucket lands in [min, max). */
const findRequestIdInBucketRange = (min: number, max: number): string => {
	for (let i = 0; i < 10_000; i++) {
		const requestId = `req_test_${i}`;
		const bucket = getRequestBucket({ requestId });
		if (bucket >= min && bucket < max) return requestId;
	}
	throw new Error(`No requestId found in bucket range [${min}, ${max})`);
};

describe("getRequestBucket", () => {
	test("is deterministic and within [0, 100)", () => {
		for (let i = 0; i < 100; i++) {
			const requestId = `req_${i}`;
			const bucket = getRequestBucket({ requestId });
			expect(bucket).toBe(getRequestBucket({ requestId }));
			expect(bucket).toBeGreaterThanOrEqual(0);
			expect(bucket).toBeLessThan(100);
		}
	});
});

describe("resolveMiscRedis", () => {
	test("routes to the active instance when no ramp is configured", () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main" });
		expect(resolveMiscRedis({ requestId: "req_1" })).toBe(main);
	});

	test("routes everything to the other instance at 100%", () => {
		_setMiscRedisConfigForTesting({
			activeInstance: "main",
			ramp: rampAt(100),
		});
		for (let i = 0; i < 20; i++) {
			expect(resolveMiscRedis({ requestId: `req_${i}` })).toBe(backup);
		}
	});

	test("routes nothing to the other instance at 0%", () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(0) });
		for (let i = 0; i < 20; i++) {
			expect(resolveMiscRedis({ requestId: `req_${i}` })).toBe(main);
		}
	});

	test("splits by requestId bucket at a fractional percent", () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(40) });

		expect(
			resolveMiscRedis({ requestId: findRequestIdInBucketRange(0, 40) }),
		).toBe(backup);
		expect(
			resolveMiscRedis({ requestId: findRequestIdInBucketRange(40, 100) }),
		).toBe(main);
	});

	test("ramps from backup back toward main when backup is active", () => {
		_setMiscRedisConfigForTesting({
			activeInstance: "backup",
			ramp: rampAt(100),
		});
		expect(resolveMiscRedis({ requestId: "req_1" })).toBe(main);
	});

	test("routes to the active instance when requestId is missing", () => {
		_setMiscRedisConfigForTesting({
			activeInstance: "main",
			ramp: rampAt(100),
		});
		expect(resolveMiscRedis({})).toBe(main);
	});

	test("falls back to the active instance when the ramp target is unconfigured", () => {
		instanceState.backupConfigured = false;
		_setMiscRedisConfigForTesting({
			activeInstance: "main",
			ramp: rampAt(100),
		});
		expect(resolveMiscRedis({ requestId: "req_1" })).toBe(main);
	});
});

describe("getMiscRedisTargets", () => {
	test("returns only the active instance when no ramp is configured", () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main" });
		expect(getMiscRedisTargets()).toEqual([
			{ instanceName: "main", redis: main },
		]);
	});

	test("includes the ramp target even at 0% (pre-warm fan-out)", () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(0) });
		expect(getMiscRedisTargets().map((t) => t.instanceName)).toEqual([
			"main",
			"backup",
		]);
	});

	test("skips an unconfigured ramp target", () => {
		instanceState.backupConfigured = false;
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(50) });
		expect(getMiscRedisTargets().map((t) => t.instanceName)).toEqual(["main"]);
	});
});

describe("forEachMiscRedisTarget", () => {
	test("runs the operation against every target", async () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(10) });

		const visited: string[] = [];
		const results = await forEachMiscRedisTarget({
			operation: async ({ instanceName }) => {
				visited.push(instanceName);
				return instanceName;
			},
		});

		expect(visited).toEqual(["main", "backup"]);
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
	});

	test("one failing target never blocks the others", async () => {
		_setMiscRedisConfigForTesting({ activeInstance: "main", ramp: rampAt(10) });

		const errors: string[] = [];
		const results = await forEachMiscRedisTarget({
			operation: async ({ instanceName }) => {
				if (instanceName === "main") throw new Error("boom");
				return instanceName;
			},
			onError: ({ target }) => {
				errors.push(target.instanceName);
			},
		});

		expect(errors).toEqual(["main"]);
		expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
	});
});
