import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import { createRedisPoolMonitor } from "@/external/redis/poolMonitor/createRedisPoolMonitor.js";

class FakeRedis extends EventEmitter {
	status = "ready";
	commandQueue = { length: 3 };
	offlineQueue: unknown = { length: 2 };
}

const info = mock((..._args: unknown[]) => {});
const monitor = createRedisPoolMonitor({ ctx: { logger: { info } } });
const clients: FakeRedis[] = [];
const originalNodeEnv = process.env.NODE_ENV;
const register = () => {
	const client = new FakeRedis();
	clients.push(client);
	const redis = client as unknown as Redis;
	monitor.register({
		redis,
		name: "test:primary",
		redisType: "subject-primary",
	});
	return { client, redis };
};

afterEach(() => {
	if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = originalNodeEnv;
	monitor.stop();
	for (const client of clients) client.emit("end");
	clients.length = 0;
	info.mockClear();
});

describe("Redis pool snapshots", () => {
	test("reports physical connection queues and resets interval counters", () => {
		const { client, redis } = register();
		monitor.register({ redis, name: "duplicate", redisType: "probe" });
		client.emit("error", new Error("synthetic connection failure"));
		client.emit("reconnecting", 50);
		monitor.emitSnapshot();
		expect(info).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({
				type: "redis_pool_stats",
				name: "test:primary",
				redisType: "subject-primary",
				status: "ready",
				commandQueueLength: 3,
				offlineQueueLength: 2,
				reconnectCount: 1,
				connectionErrors: 1,
			}),
		);
		monitor.emitSnapshot();
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({ reconnectCount: 0, connectionErrors: 0 }),
		);
	});

	test("reads changing lane and router state without dispatching commands", () => {
		const { redis } = register();
		let inFlight = 2;
		monitor.setStateReader({
			redis,
			getState: () => ({
				readLane: 1,
				readLaneInFlight: inFlight,
				preferred: true,
				usable: false,
			}),
		});
		monitor.emitSnapshot();
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({
				readLane: 1,
				readLaneInFlight: 2,
				preferred: true,
				usable: false,
			}),
		);
		inFlight = 0;
		monitor.emitSnapshot();
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({ readLaneInFlight: 0 }),
		);
	});

	test("removes ended clients and tracks an explicit reconnect without duplicate listeners", () => {
		const { client } = register();
		client.emit("end");
		monitor.emitSnapshot();
		expect(info).not.toHaveBeenCalled();
		client.status = "connecting";
		client.emit("connecting");
		monitor.emitSnapshot();
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({ status: "connecting" }),
		);
		expect(client.listenerCount("error")).toBe(1);
	});

	test("reports unavailable private queue metrics as null", () => {
		const { client } = register();
		for (const queue of [
			undefined,
			{},
			{ length: -1 },
			{ length: Number.NaN },
		]) {
			client.offlineQueue = queue;
			monitor.emitSnapshot();
			expect(info).toHaveBeenLastCalledWith(
				"redis_pool_stats",
				expect.objectContaining({ offlineQueueLength: null }),
			);
		}
	});

	test("reads queues on the installed ioredis version without opening a socket", () => {
		const redis = new Redis({ lazyConnect: true });
		try {
			monitor.register({ redis, name: "test:probe", redisType: "probe" });
			monitor.emitSnapshot();
			expect(info).toHaveBeenLastCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					status: "wait",
					commandQueueLength: 0,
					offlineQueueLength: 0,
				}),
			);
		} finally {
			redis.disconnect();
		}
	});

	test("starts once, emits periodically, and stops", async () => {
		process.env.NODE_ENV = "test";
		register();
		monitor.start({ intervalMs: 10 });
		monitor.start({ intervalMs: 10 });
		expect(info).toHaveBeenCalledTimes(1);
		await Bun.sleep(35);
		expect(info.mock.calls.length).toBeGreaterThan(1);
		monitor.stop();
		const count = info.mock.calls.length;
		await Bun.sleep(25);
		expect(info).toHaveBeenCalledTimes(count);
	});

	test("does not start snapshot logging in development", async () => {
		process.env.NODE_ENV = "development";
		register();
		monitor.start({ intervalMs: 5 });
		await Bun.sleep(15);
		expect(info).not.toHaveBeenCalled();
	});

	test("emits the terminal state before retiring a monitored connection", () => {
		process.env.NODE_ENV = "test";
		const { client } = register();
		monitor.start();
		info.mockClear();
		client.status = "end";
		client.emit("end");
		expect(info).toHaveBeenLastCalledWith(
			"redis_pool_stats",
			expect.objectContaining({ status: "end" }),
		);
		info.mockClear();
		monitor.emitSnapshot();
		expect(info).not.toHaveBeenCalled();
	});

	test("a failed state reader cannot stop other snapshots or break callers", () => {
		const { redis } = register();
		monitor.setStateReader({
			redis,
			getState: () => {
				throw new Error("unavailable telemetry");
			},
		});
		register();
		expect(() => monitor.emitSnapshot()).not.toThrow();
		expect(info).toHaveBeenCalledTimes(1);
	});
});
