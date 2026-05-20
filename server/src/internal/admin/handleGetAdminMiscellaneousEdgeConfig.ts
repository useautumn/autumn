import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getMiscellaneousEdgeConfigFromSource,
	getRuntimeMiscellaneousEdgeConfigStatus,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

export const handleGetAdminMiscellaneousEdgeConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeMiscellaneousEdgeConfigStatus();
		const config = await getMiscellaneousEdgeConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
