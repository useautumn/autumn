import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { getFallbackRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MainRedisCacheConfigSchema } from "@/internal/misc/mainRedisCache/mainRedisCacheSchemas.js";
import { updateActiveMainRedisInstance } from "@/internal/misc/mainRedisCache/mainRedisCacheStore.js";

export const handleUpsertAdminMainRedisCacheConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: MainRedisCacheConfigSchema,
	handler: async (c) => {
		const { activeInstance } = c.req.valid("json");

		if (activeInstance === "fallback") {
			const fallback = getFallbackRedis();
			if (!fallback || fallback.status !== "ready") {
				throw new RecaseError({
					message:
						"CACHE_BACKUP_URL is not configured or its Redis client is not ready",
					code: ErrCode.InvalidRequest,
					statusCode: 503,
				});
			}

			const pong = await fallback.ping().catch(() => null);
			if (pong !== "PONG") {
				throw new RecaseError({
					message: "Fallback Redis did not respond to its readiness check",
					code: ErrCode.InvalidRequest,
					statusCode: 503,
				});
			}
		}

		await updateActiveMainRedisInstance({ activeInstance });
		return c.json({ success: true, activeInstance });
	},
});
