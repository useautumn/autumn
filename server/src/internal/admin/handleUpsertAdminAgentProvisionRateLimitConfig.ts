import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { AgentProvisionRateLimitConfigSchema } from "@/internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitSchemas.js";
import { updateAgentProvisionRateLimit } from "@/internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitStore.js";

export const handleUpsertAdminAgentProvisionRateLimitConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: AgentProvisionRateLimitConfigSchema,
	handler: async (c) => {
		await updateAgentProvisionRateLimit({ config: c.req.valid("json") });
		return c.json({ success: true });
	},
});
