import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getRampDestinationRedis,
	isDragonflyRampActive,
} from "@/internal/misc/dragonflyRamp/index.js";
import { getOrgRedis } from "../orgRedisPool.js";
import { resolveRedisV2 } from "../resolveRedisV2.js";

const dedupeRedisInstances = ({ candidates }: { candidates: Redis[] }) =>
	candidates.filter(
		(candidate, index) => candidates.indexOf(candidate) === index,
	);

/** Adds the ramp destination client to the candidate list when the ramp is
 *  non-zero for this org. During ramp, locks/cleanup state may exist on EITHER
 *  cluster — scanning both prevents loss across boundary crossings. */
const withRampDestinationIfActive = ({
	candidates,
	orgId,
}: {
	candidates: Redis[];
	orgId?: string;
}): Redis[] => {
	if (!isDragonflyRampActive({ orgId })) return candidates;
	const destination = getRampDestinationRedis();
	if (!destination) return candidates;
	return [...candidates, destination];
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
		candidates: withRampDestinationIfActive({
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
		candidates: withRampDestinationIfActive({
			candidates,
			orgId: ctx.org.id,
		}),
	});
};
