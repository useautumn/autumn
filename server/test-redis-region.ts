import { redis, currentRegion, getConfiguredRegions } from "./src/external/redis/initRedis.js";

console.log("Current region:", currentRegion);
console.log("Configured regions:", getConfiguredRegions());
console.log("Global redis status:", redis.status);
console.log("Global redis options:", redis.options);
