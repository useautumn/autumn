import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	getRampDestinationRedis,
	isCacheV2RampEnabled,
} from "@/internal/misc/cacheV2Ramp/index.js";
import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import {
	getAlternateRedisV2Instance,
	redisV2 as redisV2Primary,
} from "./initRedisV2.js";

let lastLoggedInstance: RedisV2InstanceName | null = null;
let publicRouteWarned = false;

/** Returns the V2 Redis instance for this request.
 *
 *  Routing order:
 *  1. If `redis-v2-cache` edge config selects a non-dragonfly instance
 *     (`upstash`/`redis`), honor it — that's a global override / kill switch
 *     and trumps the ramp.
 *  2. Otherwise (active = dragonfly), if the ramp is enabled for this
 *     customer/org AND a destination is configured → ramp destination client.
 *  3. Otherwise → primary Dragonfly.
 *
 *  Called by every ctx-building middleware/worker — request-path code reads
 *  ctx.redisV2 rather than calling this. */
export const resolveRedisV2 = (opts?: { customerId?: string }): Redis => {
	const activeInstance = getActiveRedisV2Instance();

	if (activeInstance !== lastLoggedInstance) {
		logger.info(
			`[resolveRedisV2] activeInstance switched to "${activeInstance}"`,
		);
		lastLoggedInstance = activeInstance;
	}

	if (activeInstance === "dragonfly") {
		if (isCacheV2RampEnabled({ customerId: opts?.customerId })) {
			const destination = getRampDestinationRedis();
			if (destination) return destination;
			if (!publicRouteWarned) {
				publicRouteWarned = true;
				logger.warn(
					"[resolveRedisV2] cache V2 ramp enabled but destination is not configured (or decryption failed); falling back to primary",
				);
			}
		}
		return redisV2Primary;
	}

	const alternate = getAlternateRedisV2Instance(activeInstance);
	return alternate ?? redisV2Primary;
};
