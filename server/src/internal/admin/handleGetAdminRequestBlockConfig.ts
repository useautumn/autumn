import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getRequestBlockConfigFromSource,
	getRuntimeRequestBlockStatus,
} from "@/internal/misc/requestBlocks/requestBlockStore.js";

export const handleGetAdminRequestBlockConfig = createRoute({
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
