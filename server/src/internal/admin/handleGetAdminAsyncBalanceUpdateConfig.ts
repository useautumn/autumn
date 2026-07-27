import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getAsyncBalanceUpdateConfigFromSource,
	getRuntimeAsyncBalanceUpdateConfigStatus,
} from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";

export const handleGetAdminAsyncBalanceUpdateConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeAsyncBalanceUpdateConfigStatus();
		const config = await getAsyncBalanceUpdateConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
