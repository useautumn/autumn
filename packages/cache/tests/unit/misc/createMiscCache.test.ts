import { beforeEach, describe, expect, test } from "bun:test";
import type { MiscRedisConfig } from "@autumn/edge-config";
import type { Redis } from "ioredis";
import { createMiscCache, getRequestBucket } from "../../../src/cache.js";

const fakeRedis = (name: string): Redis =>
	({
		status: "ready",
		_name: name,
		on() {},
		disconnect() {},
	}) as unknown as Redis;

const main = fakeRedis("main");
const backup = fakeRedis("backup");

const BACKUP = {
	publicConnectionString: "rediss://backup:6385",
	privateConnectionString: null,
	url: "backup:6385",
};

const rampAt = (percent: number) => ({
	percent,
	previousPercent: 0,
	changedAt: 0,
});

let config: MiscRedisConfig;
const setConfig = (partial: Partial<MiscRedisConfig>) => {
	config = { activeInstance: "main", ramp: null, backup: BACKUP, ...partial };
};

const cache = createMiscCache({
	ctx: {
		config: () => config,
		env: { mainUrl: "rediss://main:6385", region: "test", onEcs: false },
		decrypt: (encrypted) => encrypted,
		createClient: ({ config: clientConfig }) =>
			clientConfig.url === BACKUP.publicConnectionString ? backup : main,
	},
	config: { commandTimeoutMs: 1_000 },
});

beforeEach(() => {
	setConfig({});
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

describe("resolve", () => {
	test("routes to the active instance when no ramp is configured", () => {
		expect(cache.resolve({ requestId: "req_1" })).toBe(main);
	});

	test("routes everything to the other instance at 100%", () => {
		setConfig({ ramp: rampAt(100) });
		for (let i = 0; i < 20; i++) {
			expect(cache.resolve({ requestId: `req_${i}` })).toBe(backup);
		}
	});

	test("routes nothing to the other instance at 0%", () => {
		setConfig({ ramp: rampAt(0) });
		for (let i = 0; i < 20; i++) {
			expect(cache.resolve({ requestId: `req_${i}` })).toBe(main);
		}
	});

	test("splits by requestId bucket at a fractional percent", () => {
		setConfig({ ramp: rampAt(40) });
		expect(
			cache.resolve({ requestId: findRequestIdInBucketRange(0, 40) }),
		).toBe(backup);
		expect(
			cache.resolve({ requestId: findRequestIdInBucketRange(40, 100) }),
		).toBe(main);
	});

	test("ramps from backup back toward main when backup is active", () => {
		setConfig({ activeInstance: "backup", ramp: rampAt(100) });
		expect(cache.resolve({ requestId: "req_1" })).toBe(main);
	});

	test("routes to the active instance when requestId is missing", () => {
		setConfig({ ramp: rampAt(100) });
		expect(cache.resolve({})).toBe(main);
	});

	test("falls back to the active instance when the ramp target is unconfigured", () => {
		setConfig({ ramp: rampAt(100), backup: null });
		expect(cache.resolve({ requestId: "req_1" })).toBe(main);
	});
});

describe("getActive", () => {
	test("returns backup when it is active and configured", () => {
		setConfig({ activeInstance: "backup" });
		expect(cache.getActive()).toBe(backup);
	});

	test("falls back to main when backup is active but unconfigured", () => {
		setConfig({ activeInstance: "backup", backup: null });
		expect(cache.getActive()).toBe(main);
	});
});

describe("targets", () => {
	test("returns only the active instance when no ramp is configured", () => {
		expect(cache.targets()).toEqual([{ instanceName: "main", redis: main }]);
	});

	test("includes the ramp target even at 0% (pre-warm fan-out)", () => {
		setConfig({ ramp: rampAt(0) });
		expect(cache.targets().map((target) => target.instanceName)).toEqual([
			"main",
			"backup",
		]);
	});

	test("skips an unconfigured ramp target", () => {
		setConfig({ ramp: rampAt(50), backup: null });
		expect(cache.targets().map((target) => target.instanceName)).toEqual([
			"main",
		]);
	});
});

describe("forEachTarget", () => {
	test("runs the operation against every target", async () => {
		setConfig({ ramp: rampAt(10) });
		const visited: string[] = [];
		const results = await cache.forEachTarget({
			operation: async ({ instanceName }) => {
				visited.push(instanceName);
				return instanceName;
			},
		});
		expect(visited).toEqual(["main", "backup"]);
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);
	});

	test("one failing target never blocks the others", async () => {
		setConfig({ ramp: rampAt(10) });
		const errors: string[] = [];
		const results = await cache.forEachTarget({
			operation: async ({ instanceName }) => {
				if (instanceName === "main") throw new Error("boom");
				return instanceName;
			},
			onError: ({ target }) => {
				errors.push(target.instanceName);
			},
		});
		expect(errors).toEqual(["main"]);
		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
		]);
	});
});
