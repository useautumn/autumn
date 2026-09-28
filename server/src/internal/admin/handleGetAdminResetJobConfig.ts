import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getResetJobConfigFromSource,
	getResetJobConfigStatus,
} from "@/internal/misc/resetJob/resetJobStore.js";

export const handleGetAdminResetJobConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getResetJobConfigStatus();
		const config = await getResetJobConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
