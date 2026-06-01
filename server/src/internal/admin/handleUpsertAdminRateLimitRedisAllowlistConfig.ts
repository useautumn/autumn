import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RateLimitRedisAllowlistConfigSchema } from "@/internal/misc/rateLimiter/rateLimitRedisAllowlistSchemas.js";
import { updateFullRateLimitRedisAllowlistConfig } from "@/internal/misc/rateLimiter/rateLimitRedisAllowlistStore.js";

export const handleUpsertAdminRateLimitRedisAllowlistConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: RateLimitRedisAllowlistConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullRateLimitRedisAllowlistConfig({ config: body });

		return c.json({ success: true });
	},
});
