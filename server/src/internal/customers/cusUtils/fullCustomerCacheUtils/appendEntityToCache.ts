import type { Entity } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

type UpsertEntityAction = "appended" | "updated" | "skipped";

type UpsertEntityResult = {
	success: boolean;
	action?: UpsertEntityAction;
	reason?: "already_exists" | "no_changes";
	cacheMiss?: boolean;
};

/**
 * Upsert an entity in the customer's entities array in the Redis cache.
 * - If entity with same internal_id exists: update id and name if different
 * - If entity with same id exists (different internal_id): skip
 * - Otherwise: append the new entity
 *
 * CRDT-safe: Uses JSON.SET for updates and JSON.ARRAPPEND for new entities.
 */
export const upsertEntityInCache = async ({
	ctx,
	customerId,
	entity,
}: {
	ctx: AutumnContext;
	customerId: string;
	entity: Entity;
}): Promise<UpsertEntityResult | null> => {
	const { org, env, logger } = ctx;

	try {
		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const entityJson = JSON.stringify(entity);

		const result = await tryRedisWrite(async () => {
			return await redis.appendEntityToCustomer(cacheKey, entityJson);
		});

		if (result === null) {
			logger.warn(
				`[upsertEntityInCache] Redis write failed for customer ${customerId}, entity ${entity.id}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			action?: UpsertEntityAction;
			reason?: string;
			cache_miss?: boolean;
		};

		logger.info(
			`[upsertEntityInCache] customer: ${customerId}, entity: ${entity.id}, action: ${parsed.action ?? "none"}, reason: ${parsed.reason ?? (parsed.cache_miss ? "cache_miss" : "none")}`,
		);

		return {
			success: parsed.success,
			action: parsed.action,
			reason: parsed.reason as "already_exists" | "no_changes" | undefined,
			cacheMiss: parsed.cache_miss,
		};
	} catch (error) {
		logger.error(
			`[upsertEntityInCache] Error upserting entity ${entity.id} for customer ${customerId}`,
			error,
		);
		return null;
	}
};
