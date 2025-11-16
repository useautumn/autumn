import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCachedApiEntityKey } from "./getCachedApiEntity.js";

/**
 * Delete entity from Redis cache
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
	// Check if Redis is ready before attempting deletion
	if (redis.status !== "ready") {
		ctx.logger.warn("❗️ Redis not ready, skipping entity cache deletion", {
			status: redis.status,
			entityId,
		});
		return;
	}

	const { org, env } = ctx;

	const cacheKey = buildCachedApiEntityKey({
		entityId,
		customerId,
		orgId: org.id,
		env,
	});

	// Delete all entity-related keys (base + features + breakdowns + rollovers)
	const keysToDelete = await redis.keys(`${cacheKey}*`);
	if (keysToDelete.length > 0) {
		await redis.del(...keysToDelete);
	}
};
