import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();
const { warmupRegionalRedis } = await import("./external/redis/initRedis.js");
await warmupRegionalRedis();

const { initDrizzle } = await import("./db/initDrizzle.js");
const { db } = initDrizzle();
const { preWarmOrgRedisConnections } = await import(
	"./external/redis/orgRedisPool.js"
);
preWarmOrgRedisConnections({ db }).catch((error) =>
	console.error("[OrgRedis] Cron pre-warm failed:", error),
);

await import("./cron/cronInit.js");
