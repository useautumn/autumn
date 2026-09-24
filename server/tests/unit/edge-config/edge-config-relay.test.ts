/**
 * The cluster primary is a pure relay: it fetches each subscribed key's raw S3
 * body once and fans it out to every fork over IPC.
 *
 * Contract:
 *   - startEdgeConfigRelay sets AUTUMN_EDGE_CONFIG_RELAY=1 so forks inherit it.
 *   - The first subscribe for a key fetches it once, however many forks
 *     subscribe concurrently (single-flight), and the result reaches every fork.
 *   - A subscribe for a cached key replies to that fork immediately with zero
 *     fetches. Unknown message types are ignored.
 *   - Keys without pollIntervalMs follow the change signal: one fetch per key
 *     per change, broadcast to every live fork (dead forks are skipped).
 *   - Keys with pollIntervalMs are polled on their own interval and are not
 *     part of the change-signal refresh.
 *   - A failed fetch is broadcast as edge-config:error.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import { createEdgeConfigRegistry } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { startEdgeConfigRelay } from "@/internal/misc/edgeConfig/edgeConfigRelay.js";
import { createFakeCluster, lastOf, sentFor } from "./utils/fakeCluster.js";
import { createFakeLogger } from "./utils/fakeLogger.js";

const logger = createFakeLogger();
const stops: (() => void)[] = [];
const originalRelayEnv = process.env.AUTUMN_EDGE_CONFIG_RELAY;

afterEach(() => {
	for (const stop of stops) stop();
	stops.length = 0;
	if (originalRelayEnv === undefined)
		delete process.env.AUTUMN_EDGE_CONFIG_RELAY;
	else process.env.AUTUMN_EDGE_CONFIG_RELAY = originalRelayEnv;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const startRelay = async ({
	fetchRaw,
	redisVersion = () => "r1",
}: {
	fetchRaw: (params: { key: string }) => Promise<string | null>;
	redisVersion?: () => string | null;
}) => {
	const fakeCluster = createFakeCluster();
	const registry = createEdgeConfigRegistry({
		readRedisVersion: async () => redisVersion(),
		readTimestamp: async () => "t1",
		writeTimestamp: async () => "t1",
		pollIntervalMs: 60_000,
		backstopIntervalMs: 60 * 60_000,
		follower: null,
	});
	const relay = await startEdgeConfigRelay({
		clusterModule: fakeCluster.clusterModule,
		logger,
		fetchRaw,
		registry,
	});
	stops.push(relay.stop);
	return { ...fakeCluster, registry, relay };
};

describe("edge config relay", () => {
	test("fetches each key once for all forks and serves cached keys with zero fetches", async () => {
		delete process.env.AUTUMN_EDGE_CONFIG_RELAY;
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetchRaw = jest.fn(async ({ key }: { key: string }) => {
			await gate;
			return `{"key":"${key}"}`;
		});
		const { emitter, fork, subscribe } = await startRelay({ fetchRaw });

		// forks inherit the relay flag
		expect(process.env).toMatchObject({ AUTUMN_EDGE_CONFIG_RELAY: "1" });

		// three forks subscribe while the first fetch is still in flight
		const forks = [fork(), fork(), fork()];
		for (const worker of forks) {
			subscribe({
				worker,
				keys: [{ key: "admin/a.json" }, { key: "admin/b.json" }],
			});
		}
		release();
		await flush();

		expect(fetchRaw).toHaveBeenCalledTimes(2);
		for (const worker of forks) {
			expect(sentFor({ worker, key: "admin/a.json" })).toEqual([
				{
					type: "edge-config:update",
					key: "admin/a.json",
					raw: '{"key":"admin/a.json"}',
				},
			]);
			expect(sentFor({ worker, key: "admin/b.json" })).toHaveLength(1);
		}

		// a respawned fork is answered from cache, synchronously, no S3 request
		const respawned = fork();
		subscribe({ worker: respawned, keys: [{ key: "admin/a.json" }] });
		expect(fetchRaw).toHaveBeenCalledTimes(2);
		expect(sentFor({ worker: respawned, key: "admin/a.json" })).toEqual([
			{
				type: "edge-config:update",
				key: "admin/a.json",
				raw: '{"key":"admin/a.json"}',
			},
		]);

		// other cluster traffic on the same channel is ignored
		emitter.emit("message", respawned, { type: "fork-recycle:request" });
		expect(fetchRaw).toHaveBeenCalledTimes(2);
	});

	test("a change signal fetches each key once and broadcasts to every live fork", async () => {
		let version = 1;
		let redisVersion = "r1";
		const fetchRaw = jest.fn(async ({ key }: { key: string }) =>
			key === "admin/bad.json" && version > 1
				? Promise.reject(new Error("503 SlowDown"))
				: `{"v":${version}}`,
		);
		const { fork, registry, subscribe } = await startRelay({
			fetchRaw,
			redisVersion: () => redisVersion,
		});
		const [first, second, dead] = [fork(), fork(), fork()];
		subscribe({
			worker: first,
			keys: [{ key: "admin/a.json" }, { key: "admin/bad.json" }],
		});
		subscribe({ worker: second, keys: [{ key: "admin/a.json" }] });
		await flush();
		expect(fetchRaw).toHaveBeenCalledTimes(2);

		const sentBeforeDeath = dead.sent.length;
		dead.dead = true;
		version = 2;
		redisVersion = "r2";
		await registry.checkForChanges();
		await flush();

		// one fetch per key for the whole task
		expect(fetchRaw).toHaveBeenCalledTimes(4);
		// every live fork gets the new body
		for (const worker of [first, second]) {
			expect(lastOf(sentFor({ worker, key: "admin/a.json" }))).toEqual({
				type: "edge-config:update",
				key: "admin/a.json",
				raw: '{"v":2}',
			});
		}
		expect(dead.sent).toHaveLength(sentBeforeDeath);

		// a failed fetch is broadcast as an error, not swallowed
		expect(lastOf(sentFor({ worker: first, key: "admin/bad.json" }))).toEqual({
			type: "edge-config:error",
			key: "admin/bad.json",
			error: "503 SlowDown",
		});
	});

	test("interval keys poll on their own interval, outside the change signal", async () => {
		let redisVersion = "r1";
		const fetchRaw = jest.fn(
			async ({ key }: { key: string }) => `{"key":"${key}"}`,
		);
		const { fork, registry, relay, subscribe } = await startRelay({
			fetchRaw,
			redisVersion: () => redisVersion,
		});
		const worker = fork();
		subscribe({
			worker,
			keys: [{ key: "admin/slot.json", pollIntervalMs: 20 }],
		});

		await new Promise((resolve) => setTimeout(resolve, 110));
		const polled = fetchRaw.mock.calls.length;
		expect(polled).toBeGreaterThanOrEqual(4);
		expect(sentFor({ worker, key: "admin/slot.json" }).length).toBe(polled);

		// the change signal never touches an interval key
		relay.stop();
		redisVersion = "r2";
		await registry.checkForChanges();
		await flush();
		expect(fetchRaw.mock.calls.length).toBe(polled);
	});
});
