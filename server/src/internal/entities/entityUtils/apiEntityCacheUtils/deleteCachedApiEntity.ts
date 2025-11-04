import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCachedApiEntityKey } from "./getCachedApiEntity.js";

/**
 * Delete ApiEntity from Redis cache
 */
export const deleteCachedApiEntity = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
}): Promise<void> => {
	const { org, env } = ctx;

	const cacheKey = buildCachedApiEntityKey({
		entityId,
		orgId: org.id,
		env,
	});

	// Delete all entity-related keys (base + features + breakdowns + rollovers)
	const keysToDelete = await redis.keys(`${cacheKey}*`);
	if (keysToDelete.length > 0) {
		await redis.del(...keysToDelete);
	}
};
