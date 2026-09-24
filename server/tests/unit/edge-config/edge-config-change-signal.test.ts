/**
 * Registry change detection: a Redis marker checked every tick, with the S3
 * timestamp as a slower safety net and the 10-min backstop behind both.
 *
 * Contract:
 *   - A new Redis marker refreshes every store on the next tick; an unchanged
 *     or missing (null) marker does not.
 *   - The S3 timestamp is read every 60s while Redis reads succeed and every
 *     10s while they fail; a changed S3 timestamp refreshes even when the
 *     Redis marker never moved.
 *   - A refresh that leaves any store unhealthy does not advance either
 *     marker, and is retried no sooner than every 10s until it succeeds.
 *   - The backstop refreshes on its own interval regardless of either marker.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import { createEdgeConfigRegistry } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createFakeEdgeConfigStore } from "./utils/fakeEdgeConfigStore.js";

const registries: ReturnType<typeof createEdgeConfigRegistry>[] = [];

afterEach(() => {
	for (const registry of registries) registry.stop();
	registries.length = 0;
});

const createSignalRegistry = ({
	redisVersion,
	timestamp,
}: {
	redisVersion: () => string | null | Error;
	timestamp: () => string | null;
}) => {
	let clock = 1_000_000;
	const readRedisVersion = jest.fn(async () => {
		const value = redisVersion();
		if (value instanceof Error) throw value;
		return value;
	});
	const readTimestamp = jest.fn(async () => timestamp());
	const store = createFakeEdgeConfigStore({ s3Key: "admin/a.json" });
	const registry = createEdgeConfigRegistry({
		readRedisVersion,
		readTimestamp,
		writeTimestamp: async () => "created",
		pollIntervalMs: 60_000,
		backstopIntervalMs: 60 * 60_000,
		now: () => clock,
		follower: null,
	});
	registry.register({ store });
	registries.push(registry);

	const tickAfter = async (ms: number) => {
		clock += ms;
		await registry.checkForChanges();
	};

	return { readRedisVersion, readTimestamp, registry, store, tickAfter };
};

describe("edge config change signal", () => {
	test("refreshes on a new Redis marker, never on an unchanged or missing one", async () => {
		let redisVersion: string | null = "r1";
		const { registry, store, tickAfter } = createSignalRegistry({
			redisVersion: () => redisVersion,
			timestamp: () => "t1",
		});
		await registry.start();
		expect(store.refresh).toHaveBeenCalledTimes(1);

		// unchanged marker: no refresh
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(1);

		// new marker: refresh on the next tick
		redisVersion = "r2";
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(2);

		// missing key is "no signal", not a change
		redisVersion = null;
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(2);
	});

	test("reads S3 every 60s while Redis is healthy and every 10s while it fails", async () => {
		let redisVersion: string | Error = "r1";
		let timestamp = "t1";
		const { readTimestamp, registry, store, tickAfter } = createSignalRegistry({
			redisVersion: () => redisVersion,
			timestamp: () => timestamp,
		});
		await registry.start();
		expect(readTimestamp).toHaveBeenCalledTimes(1);

		// healthy Redis: 29 ticks (58s) never touch S3, the 30th (60s) does
		for (let i = 0; i < 29; i++) await tickAfter(2_000);
		expect(readTimestamp).toHaveBeenCalledTimes(1);
		await tickAfter(2_000);
		expect(readTimestamp).toHaveBeenCalledTimes(2);

		// S3 timestamp moved while the Redis marker stayed put (lost bump)
		timestamp = "t2";
		for (let i = 0; i < 30; i++) await tickAfter(2_000);
		expect(readTimestamp).toHaveBeenCalledTimes(3);
		expect(store.refresh).toHaveBeenCalledTimes(2);

		// failing Redis: S3 falls back to the old 10s cadence
		redisVersion = new Error("ECONNREFUSED");
		for (let i = 0; i < 4; i++) await tickAfter(2_000);
		expect(readTimestamp).toHaveBeenCalledTimes(3);
		await tickAfter(2_000);
		expect(readTimestamp).toHaveBeenCalledTimes(4);
	});

	test("keeps retrying a failed refresh every 10s until every store is healthy", async () => {
		let redisVersion = "r1";
		const { registry, store, tickAfter } = createSignalRegistry({
			redisVersion: () => redisVersion,
			timestamp: () => "t1",
		});
		await registry.start();

		// the refresh for r2 fails: marker must not be marked as handled
		store.setHealthy(false);
		redisVersion = "r2";
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(2);

		// retry is capped at 10s, not every 2s tick
		for (let i = 0; i < 4; i++) await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(2);
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(3);

		// recovery commits the marker; later ticks stop refreshing
		store.setHealthy(true);
		await tickAfter(10_000);
		expect(store.refresh).toHaveBeenCalledTimes(4);
		await tickAfter(2_000);
		await tickAfter(2_000);
		expect(store.refresh).toHaveBeenCalledTimes(4);
	});

	test("backstop refreshes even when neither marker moves", async () => {
		const store = createFakeEdgeConfigStore({ s3Key: "admin/a.json" });
		const registry = createEdgeConfigRegistry({
			readRedisVersion: async () => "r1",
			readTimestamp: async () => "t1",
			writeTimestamp: async () => "t1",
			pollIntervalMs: 60_000,
			backstopIntervalMs: 20,
			follower: null,
		});
		registry.register({ store });
		registries.push(registry);
		await registry.start();

		await new Promise((resolve) => setTimeout(resolve, 70));

		expect(store.refresh.mock.calls.length).toBeGreaterThan(1);
	});
});
