import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RedisV2CacheConfigSchema } from "@/internal/misc/edgeConfigs/redisV2Cache/redisV2CacheSchemas.js";
import { updateActiveRedisV2Instance } from "@/internal/misc/edgeConfigs/redisV2Cache/redisV2CacheStore.js";

export const handleUpsertAdminRedisV2CacheConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: RedisV2CacheConfigSchema,
	handler: async (c) => {
		const { activeInstance } = c.req.valid("json");
		await updateActiveRedisV2Instance({ activeInstance });
		return c.json({ success: true, activeInstance });
	},
});
