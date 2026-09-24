/**
 * A cluster fork follows the primary's relay instead of polling S3 itself,
 * and falls back to local polling when the primary never answers.
 *
 * Contract:
 *   - startAllEdgeConfigPolling sends ONE edge-config:subscribe with every
 *     registered key and resolves only once each key got its first update or
 *     error. Updates and errors land on the matching store (stale-while-
 *     revalidate on error); the fork makes zero S3 requests.
 *   - A store registered after start subscribes for its own key.
 *   - store.startPolling subscribes with its pollIntervalMs instead of polling.
 *   - A key the primary never answers within the response timeout falls back to
 *     local S3 polling for that process, with a warning.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import { createEdgeConfigFollower } from "@/internal/misc/edgeConfig/edgeConfigFollower.js";
import { createEdgeConfigRegistry } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { createFakeForkProcess, lastOf } from "./utils/fakeCluster.js";
import { createFakeLogger } from "./utils/fakeLogger.js";

const TestSchema = z.object({ message: z.string() });
const defaultValue = () => ({ message: "default" });

const stops: (() => void)[] = [];
afterEach(() => {
	for (const stop of stops) stop();
	stops.length = 0;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = ({ responseTimeoutMs = 5_000, pollIntervalMs = 60_000 } = {}) => {
	const fork = createFakeForkProcess();
	const logger = createFakeLogger();
	const follower = createEdgeConfigFollower({
		processModule: fork.processModule,
		responseTimeoutMs,
	});
	const s3Send = jest.fn(async (_command: unknown) => ({
		Body: { transformToString: async () => '{"message":"from-s3"}' },
	}));
	const s3GetsFor = (key: string) =>
		s3Send.mock.calls.filter(
			([command]) => (command as { input: { Key: string } }).input.Key === key,
		).length;
	const s3Client = { send: s3Send } as unknown as S3Client;
	const createStore = ({
		s3Key,
		pollIntervalMs,
	}: {
		s3Key: string;
		pollIntervalMs?: number;
	}) => {
		const store = createEdgeConfigStore({
			s3Key,
			schema: TestSchema,
			defaultValue,
			pollIntervalMs,
			s3Client,
			follower,
		});
		stops.push(store.stopPolling);
		return store;
	};
	// A marker that moves every tick, so a running local poll loop refreshes.
	let marker = 0;
	const registry = createEdgeConfigRegistry({
		readRedisVersion: async () => `r${marker++}`,
		readTimestamp: async () => "t1",
		writeTimestamp: async () => "t1",
		pollIntervalMs,
		backstopIntervalMs: 60 * 60_000,
		follower,
	});
	stops.push(registry.stop);
	return { createStore, fork, logger, registry, s3GetsFor, s3Send };
};

describe("edge config follower", () => {
	test("subscribes once for every registered key and applies updates and errors", async () => {
		const { createStore, fork, logger, registry, s3Send } = setup();
		const storeA = createStore({ s3Key: "admin/a.json" });
		const storeB = createStore({ s3Key: "admin/b.json" });
		registry.register({ store: storeA });
		registry.register({ store: storeB });

		let started = false;
		const start = registry.start({ logger }).then(() => {
			started = true;
		});
		await flush();

		// one subscribe carrying every key
		expect(fork.sent).toEqual([
			{
				type: "edge-config:subscribe",
				keys: [{ key: "admin/a.json" }, { key: "admin/b.json" }],
			},
		]);

		// boot waits for a first answer on every key
		fork.reply({
			type: "edge-config:update",
			key: "admin/a.json",
			raw: '{"message":"relayed-a"}',
		});
		await flush();
		expect(started).toBe(false);
		fork.reply({
			type: "edge-config:error",
			key: "admin/b.json",
			error: "503 SlowDown",
		});
		await start;

		// update and error land on the matching store
		expect(storeA.get()).toEqual({ message: "relayed-a" });
		expect(storeA.getStatus().healthy).toBe(true);
		expect(storeB.get()).toEqual(defaultValue());
		expect(storeB.getStatus()).toMatchObject({
			healthy: false,
			error: "503 SlowDown",
		});

		// stale-while-revalidate: an error after a good value keeps the value
		fork.reply({
			type: "edge-config:update",
			key: "admin/b.json",
			raw: '{"message":"relayed-b"}',
		});
		fork.reply({
			type: "edge-config:error",
			key: "admin/b.json",
			error: "503 SlowDown",
		});
		expect(storeB.get()).toEqual({ message: "relayed-b" });
		expect(storeB.getStatus().healthy).toBe(false);

		// the fork itself never touches S3
		expect(s3Send).not.toHaveBeenCalled();
	});

	test("late registrations and startPolling subscribe for their own key", async () => {
		const { createStore, fork, logger, registry, s3Send } = setup();
		await registry.start({ logger });
		expect(fork.sent).toEqual([]);

		// store registered after start
		const late = createStore({ s3Key: "admin/late.json" });
		registry.register({ store: late });
		expect(lastOf(fork.sent)).toEqual({
			type: "edge-config:subscribe",
			keys: [{ key: "admin/late.json" }],
		});
		fork.reply({
			type: "edge-config:update",
			key: "admin/late.json",
			raw: '{"message":"late"}',
		});
		expect(late.get()).toEqual({ message: "late" });

		// blue-green style store: subscribes with its own interval
		const slot = createStore({
			s3Key: "admin/slot.json",
			pollIntervalMs: 2_000,
		});
		const polling = slot.startPolling({ logger });
		await flush();
		expect(lastOf(fork.sent)).toEqual({
			type: "edge-config:subscribe",
			keys: [{ key: "admin/slot.json", pollIntervalMs: 2_000 }],
		});
		fork.reply({
			type: "edge-config:update",
			key: "admin/slot.json",
			raw: '{"message":"green"}',
		});
		await polling;
		expect(slot.get()).toEqual({ message: "green" });
		expect(s3Send).not.toHaveBeenCalled();
	});

	test("falls back to local S3 polling when the primary never answers", async () => {
		const { createStore, logger, registry, s3GetsFor } = setup({
			responseTimeoutMs: 20,
			pollIntervalMs: 20,
		});
		const store = createStore({ s3Key: "admin/a.json" });
		registry.register({ store });

		// registry path: loads from S3, then keeps polling locally
		await registry.start({ logger });
		expect(s3GetsFor("admin/a.json")).toBe(1);
		expect(store.get()).toEqual({ message: "from-s3" });
		expect(logger.warn).toHaveBeenCalledTimes(1);

		// startPolling path: same, on the store's own interval
		const slot = createStore({ s3Key: "admin/slot.json", pollIntervalMs: 20 });
		await slot.startPolling({ logger });
		expect(s3GetsFor("admin/slot.json")).toBe(1);
		expect(slot.get()).toEqual({ message: "from-s3" });
		expect(logger.warn).toHaveBeenCalledTimes(2);

		await new Promise((resolve) => setTimeout(resolve, 90));
		expect(s3GetsFor("admin/a.json")).toBeGreaterThan(1);
		expect(s3GetsFor("admin/slot.json")).toBeGreaterThan(1);
	});
});
