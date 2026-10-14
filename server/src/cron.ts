import { getAutumnEnv } from "@autumn/env";
import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();
getAutumnEnv();
const { warmupRegionalRedis } = await import("./external/redis/initRedis.js");
await warmupRegionalRedis();

await import("./internal/misc/redisV2Cache/redisV2CacheStore.js");
await import("./internal/misc/miscRedisConfig/miscRedisConfigStore.js");
await import("./internal/misc/cacheV2Ramp/cacheV2RampStore.js");
await import("./internal/misc/resetJobV2/resetJobV2Store.js");
await import(
	"./internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js"
);
const { logger } = await import("./external/logtail/logtailUtils.js");
const { startAllEdgeConfigPolling } = await import(
	"./internal/misc/edgeConfig/edgeConfigRegistry.js"
);
await startAllEdgeConfigPolling({ logger });

const { resolveAwsTaskIdentity } = await import(
	"./external/aws/ecs/awsTaskIdentity.js"
);
await resolveAwsTaskIdentity();
const { startBlueGreenSlotStorePolling } = await import(
	"./queue/blueGreen/blueGreenSlotStore.js"
);
await startBlueGreenSlotStorePolling({ serviceName: "cron", logger });

const { startBalanceWorkerClient } = await import(
	"./external/balanceWorker/getBalanceWorkerClient.js"
);
void startBalanceWorkerClient().catch((error) => {
	logger.error(
		{ error },
		"[balance-worker] Client startup failed; routing will retry",
	);
});

await import("./cron/cronInit.js");
