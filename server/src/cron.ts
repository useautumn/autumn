import { initInfisical } from "./external/infisical/initInfisical.js";

await initInfisical();
const { warmupRegionalRedis } = await import("./external/redis/initRedis.js");
await warmupRegionalRedis();

await import("./cron/cronInit.js");
