import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getDbCapacityConfigFromSource,
	getRuntimeDbCapacityConfig,
	getRuntimeDbCapacityConfigStatus,
} from "@/internal/misc/dbCapacity/dbCapacityConfigStore.js";

export const handleGetAdminDbCapacityConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeDbCapacityConfigStatus();
		let config = getRuntimeDbCapacityConfig();
		let sourceError: string | null = null;
		try {
			config = await getDbCapacityConfigFromSource();
		} catch (error) {
			sourceError = error instanceof Error ? error.message : String(error);
		}

		return c.json({
			...config,
			configHealthy: status.healthy && sourceError === null,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: sourceError ?? status.error ?? null,
		});
	},
});
