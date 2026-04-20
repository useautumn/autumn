import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getRolloutConfigFromSource,
	getRolloutConfigStatus,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleGetRollouts = createRoute({
	handler: async (c) => {
		const status = getRolloutConfigStatus();
		const config = await getRolloutConfigFromSource();

		return c.json({
			rollouts: config.rollouts,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
