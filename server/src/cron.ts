import { initInfisical } from "./external/infisical/initInfisical.js";
import { warmupRegionalRedis } from "./external/redis/initRedis.js";

await initInfisical();
await warmupRegionalRedis();

await import("./cron/cronInit.js");
