import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getCustomerBlockConfigFromSource,
	getRuntimeCustomerBlockStatus,
} from "@/internal/misc/edgeConfigs/customerBlocks/customerBlockStore.js";

export const handleGetAdminCustomerBlockConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeCustomerBlockStatus();
		const config = await getCustomerBlockConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
