import { afterAll, describe, expect, mock, test } from "bun:test";

// Recycled SQS workers previously polled while dedicated Redis was connecting.
// They now wait for bounded warmup before initializing queue consumers.
let resolveOrgRedisWarmup = () => {};
let initWorkersCalled = false;

const orgRedisWarmup = new Promise<void>((resolve) => {
	resolveOrgRedisWarmup = resolve;
});

mock.module("node:cluster", () => ({
	default: { isPrimary: false },
}));

mock.module("@/external/infisical/initInfisical.js", () => ({
	initInfisical: async () => {},
}));
mock.module("@/internal/misc/edgeConfig/edgeConfigRegistry.js", () => ({
	startAllEdgeConfigPolling: async () => {},
	stopAllEdgeConfigPolling: () => {},
}));

for (const modulePath of [
	"@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js",
	"@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js",
	"@/internal/misc/requestBlocks/requestBlockStore.js",
	"@/internal/misc/rollouts/rolloutConfigStore.js",
	"@/internal/misc/redisV2Cache/redisV2CacheStore.js",
	"@/internal/misc/miscRedisConfig/miscRedisConfigStore.js",
	"@/internal/misc/cacheV2Ramp/cacheV2RampStore.js",
	"@/internal/misc/jobQueues/jobQueueStore.js",
	"@/internal/misc/batchReset/batchResetConfigStore.js",
]) {
	mock.module(modulePath, () => ({}));
}

mock.module("@/utils/memoryMonitor.js", () => ({
	startMemoryMonitor: () => {},
}));
mock.module("@/instrumentation.js", () => ({}));
mock.module("@/db/initDrizzle.js", () => ({ db: {} }));
mock.module(
	"@/external/redis/availabilityMonitor/redisAvailability.js",
	() => ({
		primeRedisMonitor: async () => {},
	}),
);
mock.module(
	"@/external/redis/availabilityMonitor/redisV2Availability.js",
	() => ({
		primeRedisV2Monitor: async () => {},
		startRedisV2Monitor: () => {},
		stopRedisV2Monitor: () => {},
	}),
);
mock.module("@/external/redis/initRedis.js", () => ({
	startRedisMonitor: () => {},
	stopRedisMonitor: () => {},
	warmupRegionalRedis: async () => {},
}));
mock.module("@/external/redis/orgRedisPool.js", () => ({
	preWarmOrgRedisConnections: () => orgRedisWarmup,
}));
mock.module("@/queue/initWorkers.js", () => ({
	initWorkers: async () => {
		initWorkersCalled = true;
	},
}));

describe("queue worker Redis startup gate", () => {
	test("does not initialize SQS polling until dedicated Redis is ready", async () => {
		const workerStartup = import("@/workers.js");

		await Bun.sleep(30);
		expect(initWorkersCalled).toBe(false);

		resolveOrgRedisWarmup();
		await workerStartup;
		expect(initWorkersCalled).toBe(true);
	});
});

afterAll(() => {
	mock.restore();
});
