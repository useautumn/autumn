import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrgRedis } from "../orgRedisPool.js";
import { resolveRedisV2 } from "../resolveRedisV2.js";

const dedupeRedisInstances = ({ candidates }: { candidates: Redis[] }) =>
	candidates.filter(
		(candidate, index) => candidates.indexOf(candidate) === index,
	);

export const getRedisV2LockReceiptCandidates = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Redis[] => {
	const candidates: Redis[] = [ctx.redisV2];

	if (ctx.org.redis_config && ctx.org.redis_config.migrationPercent > 0) {
		candidates.push(getOrgRedis({ org: ctx.org }), resolveRedisV2());
	}

	return dedupeRedisInstances({ candidates });
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

	return dedupeRedisInstances({ candidates });
};
