import { getAutumnEnv } from "@autumn/env";
import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();
getAutumnEnv();
const { warmupRegionalRedis } = await import("./external/redis/initRedis.js");
await warmupRegionalRedis();

// Edge config modules self-register on import (cron reads redis-v2-cache
// so resolveRedisV2 picks the right instance on each ctx build).
await import("./internal/misc/redisV2Cache/redisV2CacheStore.js");
await import("./internal/misc/miscRedisConfig/miscRedisConfigStore.js");
await import("./internal/misc/cacheV2Ramp/cacheV2RampStore.js");
await import("./internal/misc/resetJob/resetJobStore.js");
await import("./internal/misc/resetJobV2/resetJobV2Store.js");
await import(
	"./internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js"
);
const { logger } = await import("./external/logtail/logtailUtils.js");
const { startAllEdgeConfigPolling } = await import(
	"./internal/misc/edgeConfig/edgeConfigRegistry.js"
);
await startAllEdgeConfigPolling({ logger });

// Resolve AWS task identity + start polling the cron blue-green slot store
// so `isActiveSlot({ serviceName: "cron" })` in cronInit reads fresh data.
const { resolveAwsTaskIdentity } = await import(
	"./external/aws/ecs/awsTaskIdentity.js"
);
await resolveAwsTaskIdentity();
const { startBlueGreenSlotStorePolling } = await import(
	"./queue/blueGreen/blueGreenSlotStore.js"
);
await startBlueGreenSlotStorePolling({ serviceName: "cron", logger });

await import("./cron/cronInit.js");
