import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RedisV2CacheConfigSchema } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import { updateActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";

export const handleUpsertAdminRedisV2CacheConfig = createRoute({
	body: RedisV2CacheConfigSchema,
	handler: async (c) => {
		const { activeInstance } = c.req.valid("json");
		await updateActiveRedisV2Instance({ activeInstance });
		return c.json({ success: true, activeInstance });
	},
});
