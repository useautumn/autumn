import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getBatchResetConfigFromSource,
	getBatchResetConfigStatus,
} from "@/internal/misc/batchReset/batchResetConfigStore.js";

export const handleGetAdminBatchResetConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getBatchResetConfigStatus();
		const config = await getBatchResetConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
