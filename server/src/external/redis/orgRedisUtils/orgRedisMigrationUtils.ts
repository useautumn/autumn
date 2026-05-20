import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getRampDestinationRedis,
	isCacheV2RampActive,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import { getOrgRedis } from "../orgRedisPool.js";
import { resolveRedisV2 } from "../resolveRedisV2.js";

const dedupeRedisInstances = ({ candidates }: { candidates: Redis[] }) =>
	candidates.filter(
		(candidate, index) => candidates.indexOf(candidate) === index,
	);

/** Adds BOTH primary and ramp destination clients to the candidate list when
 *  the ramp is non-zero for this org. During ramp, lock/cleanup state may
 *  exist on EITHER cluster — scanning both prevents loss across boundary
 *  crossings.
 *
 *  Gated on `activeInstance === "dragonfly"` so the upstash/redis kill switch
 *  disables ramp fan-out (when active is non-dragonfly, ramp traffic isn't
 *  routed to either cluster). */
const withRampClustersIfActive = ({
	candidates,
	orgId,
}: {
	candidates: Redis[];
	orgId?: string;
}): Redis[] => {
	if (getActiveRedisV2Instance() !== "dragonfly") return candidates;
	if (!isCacheV2RampActive({ orgId })) return candidates;
	const destination = getRampDestinationRedis();
	if (!destination) return candidates;
	return [...candidates, destination, resolveRedisV2()];
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
		candidates: withRampClustersIfActive({
			candidates,
			orgId: ctx.org.id,
		}),
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
		candidates: withRampClustersIfActive({
			candidates,
			orgId: ctx.org.id,
		}),
	});
};
