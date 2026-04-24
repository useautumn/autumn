import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import {
	getRequestBlockConfigFromSource,
	getRuntimeRequestBlockStatus,
} from "@/internal/misc/requestBlocks/requestBlockStore.js";

export const handleGetAdminRequestBlockConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeRequestBlockStatus();
		const config = await getRequestBlockConfigFromSource();

		return c.json({
			orgs: config.orgs,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
