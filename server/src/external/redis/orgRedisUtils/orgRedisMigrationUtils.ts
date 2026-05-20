import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getRampDestinationRedis,
	isCacheV2RampActive,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import { redisV2 as redisV2Primary } from "../initRedisV2.js";
import { getOrgRedis } from "../orgRedisPool.js";
import { resolveRedisV2 } from "../resolveRedisV2.js";

const dedupeRedisInstances = ({ candidates }: { candidates: Redis[] }) =>
	candidates.filter(
		(candidate, index) => candidates.indexOf(candidate) === index,
	);

/** Adds BOTH primary and ramp destination to the candidate list when the ramp
 *  is active. Lock/cleanup state may exist on EITHER cluster mid-ramp.
 *
 *  Gated on `activeInstance === "dragonfly"` so the upstash/redis kill switch
 *  also disables ramp fan-out. */
const withRampClustersIfActive = ({
	candidates,
}: {
	candidates: Redis[];
}): Redis[] => {
	if (getActiveRedisV2Instance() !== "dragonfly") return candidates;
	if (!isCacheV2RampActive()) return candidates;
	const destination = getRampDestinationRedis();
	if (!destination) return candidates;
	// Use redisV2Primary directly: at 100% ramp, resolveRedisV2() with no
	// args returns the destination (isCacheV2RampEnabled short-circuits to
	// true when migrationPercent >= 100 regardless of customerId).
	return [...candidates, destination, redisV2Primary];
};

export const getRedisV2LockReceiptCandidates = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Redis[] => {
	const candidates: Redis[] = [ctx.redisV2];

	if (ctx.org.redis_config && ctx.org.redis_config.migrationPercent > 0) {
		candidates.push(getOrgRedis({ org: ctx.org }), resolveRedisV2());
	}

	return dedupeRedisInstances({
		candidates: withRampClustersIfActive({ candidates }),
	});
};

export const getRedisV2OrgCleanupCandidates = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Redis[] => {
	const candidates: Redis[] = [ctx.redisV2, resolveRedisV2()];

	if (ctx.org.redis_config) {
		candidates.push(getOrgRedis({ org: ctx.org }));
	}

	return dedupeRedisInstances({
		candidates: withRampClustersIfActive({ candidates }),
	});
};
