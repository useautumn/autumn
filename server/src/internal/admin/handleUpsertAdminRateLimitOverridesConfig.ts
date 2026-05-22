import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RateLimitOverridesConfigSchema } from "@/internal/misc/rateLimiter/rateLimitOverridesSchemas.js";
import { updateFullRateLimitOverridesConfig } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

export const handleUpsertAdminRateLimitOverridesConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: RateLimitOverridesConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullRateLimitOverridesConfig({ config: body });

		return c.json({ success: true });
	},
});
