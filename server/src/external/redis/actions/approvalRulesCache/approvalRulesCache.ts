import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

// Short, because a clear that fails on one instance leaves stale permissions until expiry.
export const APPROVAL_RULES_CACHE_TTL_SECONDS = 60 * 5;
const GENERATION_TTL_SECONDS = 60 * 60 * 24;

export const buildApprovalRulesCacheKey = ({ orgId }: { orgId: string }) =>
	`approval_rules:${orgId}`;

export const buildApprovalRulesGenerationKey = ({ orgId }: { orgId: string }) =>
	`approval_rules_gen:${orgId}`;

type CachedEntry<T> = { generation: string; value: T };

/**
 * Returns the cached value only if no write has happened since it was filled,
 * plus the current generation for the caller to fill with.
 */
export const getCachedApprovalRules = async <T>({
	orgId,
	requestId,
}: {
	orgId: string;
	requestId?: string;
}): Promise<{ value: T | null; generation: string }> => {
	const redis = resolveMiscRedis({ requestId });
	const [cached, generation] =
		(await tryRedisOp({
			operation: () =>
				redis.mget(
					buildApprovalRulesCacheKey({ orgId }),
					buildApprovalRulesGenerationKey({ orgId }),
				),
			source: "approval-rules-cache:get",
			redisInstance: redis,
		})) ?? [];
	const currentGeneration = generation ?? "0";
	if (!cached) return { value: null, generation: currentGeneration };

	const entry = JSON.parse(cached) as CachedEntry<T>;
	const isCurrent = entry.generation === currentGeneration;
	return {
		value: isCurrent ? entry.value : null,
		generation: currentGeneration,
	};
};

/** `generation` is the one read before loading `value`; a write since then makes this entry unreadable. */
export const setCachedApprovalRules = async ({
	orgId,
	requestId,
	generation,
	value,
}: {
	orgId: string;
	requestId?: string;
	generation: string;
	value: unknown;
}): Promise<void> => {
	const redis = resolveMiscRedis({ requestId });
	const entry: CachedEntry<unknown> = { generation, value };
	await tryRedisOp({
		operation: () =>
			redis.set(
				buildApprovalRulesCacheKey({ orgId }),
				JSON.stringify(entry),
				"EX",
				APPROVAL_RULES_CACHE_TTL_SECONDS,
			),
		source: "approval-rules-cache:set",
		redisInstance: redis,
	});
};

/** Bumps the generation and drops the entry on every live instance, so a write applies to the next read. */
export const clearApprovalRulesCache = async ({
	orgId,
}: {
	orgId: string;
}): Promise<void> => {
	const generationKey = buildApprovalRulesGenerationKey({ orgId });
	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () =>
					redis
						.multi()
						.incr(generationKey)
						.expire(generationKey, GENERATION_TTL_SECONDS)
						.del(buildApprovalRulesCacheKey({ orgId }))
						.exec(),
				source: "approval-rules-cache:clear",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[approvalRulesCache] clear failed on "${target.instanceName}" (org: ${orgId})`,
			);
		},
	});
};
