import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getFullSubjectGateConfigFromSource,
	getRuntimeFullSubjectGateConfig,
	getRuntimeFullSubjectGateConfigStatus,
} from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

export const handleGetAdminFullSubjectGateConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeFullSubjectGateConfigStatus();
		let config = getRuntimeFullSubjectGateConfig();
		let sourceError: string | null = null;
		try {
			config = await getFullSubjectGateConfigFromSource();
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
