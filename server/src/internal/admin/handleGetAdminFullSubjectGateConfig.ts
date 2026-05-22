import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getFullSubjectGateConfigFromSource,
	getRuntimeFullSubjectGateConfigStatus,
} from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

export const handleGetAdminFullSubjectGateConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeFullSubjectGateConfigStatus();
		const config = await getFullSubjectGateConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
