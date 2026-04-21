import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getRuntimeStripeSyncStatus,
	getStripeSyncConfigFromSource,
} from "@/internal/misc/stripeSync/stripeSyncStore.js";

export const handleGetAdminStripeSyncConfig = createRoute({
	handler: async (c) => {
		const status = getRuntimeStripeSyncStatus();
		const config = await getStripeSyncConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
