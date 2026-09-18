import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getAgentProvisionRateLimitFromSource,
	getRuntimeAgentProvisionRateLimitStatus,
} from "@/internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitStore.js";
import {
	PUBLIC_RATE_LIMIT_CONFIGS,
	PublicRateLimitType,
} from "@/internal/misc/rateLimiter/public/publicRateLimitConfigs.js";

export const handleGetAdminAgentProvisionRateLimitConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeAgentProvisionRateLimitStatus();
		const config = await getAgentProvisionRateLimitFromSource();

		return c.json({
			globalRequestsPerHour:
				config.globalRequestsPerHour ??
				PUBLIC_RATE_LIMIT_CONFIGS[PublicRateLimitType.AgentProvisionGlobal]
					.limit,
			requestsPerIpPerHour:
				config.requestsPerIpPerHour ??
				PUBLIC_RATE_LIMIT_CONFIGS[PublicRateLimitType.AgentProvisionClient]
					.limit,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
