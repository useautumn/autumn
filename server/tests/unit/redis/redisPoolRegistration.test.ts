import { describe, expect, mock, test } from "bun:test";
import { createRedisAvailability } from "@/external/redis/availabilityMonitor/createRedisAvailability.js";
import {
	createPooledStandbyRedisConnection,
	createRedisClient,
} from "@/external/redis/initUtils/createRedisClient.js";
import {
	acquireRedisReadLane,
	getRedisReadPoolLanes,
} from "@/external/redis/initUtils/createRedisReadPool.js";
import { getStandbyRedisRouter } from "@/external/redis/initUtils/createStandbyRedisRouter.js";
import { createRedisPoolMonitor } from "@/external/redis/poolMonitor/createRedisPoolMonitor.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const info = mock((..._args: unknown[]) => {});
const monitor = createRedisPoolMonitor({ ctx: { logger: { info } } });
await mockModuleWithRestore(
	"@/external/redis/poolMonitor/getRedisPoolMonitor.js",
	() => ({ getRedisPoolMonitor: () => monitor }),
);

describe("Redis pool registration", () => {
	test("registers all four sockets with live lane and failover state and retires them", async () => {
		info.mockClear();
		const redis = createPooledStandbyRedisConnection({
			cacheUrl: "redis://127.0.0.1:1",
			region: "test",
			redisType: "subject-primary",
		});
		try {
			const lanes = getRedisReadPoolLanes(redis);
			for (const lane of lanes) {
				for (const connection of getStandbyRedisRouter(lane)!.ordered())
					connection.status = "ready";
			}
			const lease = acquireRedisReadLane(redis)!;
			monitor.emitSnapshot();
			expect(info).toHaveBeenCalledTimes(4);
			expect(info).toHaveBeenCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					name: "test:lane-1:primary",
					readLane: 1,
					readLaneInFlight: 1,
					preferred: true,
					usable: true,
				}),
			);
			expect(info).toHaveBeenCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					name: "test:lane-1:standby",
					readLane: 1,
					readLaneInFlight: 1,
					preferred: false,
					usable: true,
				}),
			);
			lease.release();
			const router = getStandbyRedisRouter(lanes[1])!;
			const [primary] = router.ordered();
			for (let index = 0; index < 3; index++)
				router.recordOutcome({
					connection: primary,
					error: new Error("Command timed out"),
				});
			info.mockClear();
			monitor.emitSnapshot();
			expect(info).toHaveBeenCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					name: "test:lane-1:primary",
					readLaneInFlight: 0,
					preferred: false,
					usable: false,
				}),
			);
			expect(info).toHaveBeenCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					name: "test:lane-1:standby",
					preferred: true,
					usable: true,
				}),
			);
		} finally {
			redis.disconnect();
			await Bun.sleep(10);
		}
		info.mockClear();
		monitor.emitSnapshot();
		expect(info).not.toHaveBeenCalled();
	});

	test("registers and retires the separate availability probe", async () => {
		info.mockClear();
		const redis = createRedisClient({
			cacheUrl: "redis://127.0.0.1:1",
			region: "test:misc",
			redisType: "misc-primary",
		});
		const availability = createRedisAvailability({
			getRedis: () => redis,
			hasConfig: true,
			logPrefix: "TestRedis",
			logType: "test_availability",
			getEventLoopLagMs: () => 0,
		});
		try {
			await availability._runTickForTesting();
			monitor.emitSnapshot();
			expect(info).toHaveBeenCalledTimes(2);
			expect(info).toHaveBeenCalledWith(
				"redis_pool_stats",
				expect.objectContaining({
					name: "TestRedis:probe",
					redisType: "probe",
				}),
			);
			availability.stopMonitor();
			await Bun.sleep(10);
			info.mockClear();
			monitor.emitSnapshot();
			expect(info).toHaveBeenCalledTimes(1);
		} finally {
			availability.stopMonitor();
			redis.disconnect();
			await Bun.sleep(10);
		}
	});
});
