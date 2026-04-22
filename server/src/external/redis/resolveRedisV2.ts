import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import {
	getAlternateRedisV2Instance,
	redisV2 as redisV2Primary,
} from "./initRedisV2.js";

let lastLoggedInstance: RedisV2InstanceName | null = null;

/** Returns the active V2 Redis instance, selected by the redis-v2-cache edge config.
 *  Called by every ctx-building middleware/worker — request-path code reads
 *  ctx.redisV2 rather than calling this. */
export const resolveRedisV2 = (): Redis => {
	const activeInstance = getActiveRedisV2Instance();

	if (activeInstance !== lastLoggedInstance) {
		logger.info(
			`[resolveRedisV2] activeInstance switched to "${activeInstance}"`,
		);
		lastLoggedInstance = activeInstance;
	}

	if (activeInstance === "upstash") return redisV2Primary;

	const alternate = getAlternateRedisV2Instance(activeInstance);
	return alternate ?? redisV2Primary;
};
