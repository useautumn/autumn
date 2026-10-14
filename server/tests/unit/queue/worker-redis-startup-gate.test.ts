import { afterAll, describe, expect, mock, test } from "bun:test";

let resolveOrgRedisWarmup = () => {};
let initWorkersCalled = false;

const orgRedisWarmup = new Promise<void>((resolve) => {
	resolveOrgRedisWarmup = resolve;
});

const realModules = new Map<string, Record<string, unknown>>();
const mockModuleRestorable = async (
	path: string,
	factory: () => Record<string, unknown>,
) => {
	const real = await import(path).catch(() => null);
	if (real) realModules.set(path, { ...real });
	mock.module(path, factory);
};

await mockModuleRestorable("node:cluster", () => ({
	default: { isPrimary: false },
}));

await mockModuleRestorable("@/external/infisical/initInfisical.js", () => ({
	initInfisical: async () => {},
}));
await mockModuleRestorable(
	"@/internal/misc/edgeConfig/edgeConfigRegistry.js",
	() => ({
		startAllEdgeConfigPolling: async () => {},
		stopAllEdgeConfigPolling: () => {},
	}),
);

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
	await mockModuleRestorable(modulePath, () => ({}));
}

await mockModuleRestorable("@/utils/memoryMonitor.js", () => ({
	startMemoryMonitor: () => {},
}));
await mockModuleRestorable("@/instrumentation.js", () => ({}));
await mockModuleRestorable("@/db/initDrizzle.js", () => ({ db: {} }));
await mockModuleRestorable(
	"@/external/redis/availabilityMonitor/redisAvailability.js",
	() => ({
		primeRedisMonitor: async () => {},
	}),
);
await mockModuleRestorable(
	"@/external/redis/availabilityMonitor/redisV2Availability.js",
	() => ({
		primeRedisV2Monitor: async () => {},
		startRedisV2Monitor: () => {},
		stopRedisV2Monitor: () => {},
	}),
);
await mockModuleRestorable("@/external/redis/initRedis.js", () => ({
	startRedisMonitor: () => {},
	stopRedisMonitor: () => {},
	warmupRegionalRedis: async () => {},
}));
await mockModuleRestorable("@/external/redis/orgRedisPool.js", () => ({
	preWarmOrgRedisConnections: () => orgRedisWarmup,
}));
await mockModuleRestorable("@/queue/initWorkers.js", () => ({
	initWorkers: async () => {
		initWorkersCalled = true;
	},
}));

describe("queue worker Redis startup gate", () => {
	test("does not initialize SQS polling until dedicated Redis is ready", async () => {
		const workerStartup = import("@/workers.js");

		try {
			await Bun.sleep(30);
			expect(initWorkersCalled).toBe(false);
		} finally {
			resolveOrgRedisWarmup();
		}
		await workerStartup;
		expect(initWorkersCalled).toBe(true);
	});
});

afterAll(() => {
	for (const [path, real] of realModules) {
		mock.module(path, () => real);
	}
	mock.restore();
});
