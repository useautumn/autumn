import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getDbControlConfigFromSource,
	getRuntimeDbControlConfig,
	getRuntimeDbControlStatus,
} from "@/internal/misc/dbControl/dbControlStore.js";

export const handleGetAdminDbControlConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeDbControlStatus();
		let config = getRuntimeDbControlConfig();
		let sourceError: string | null = null;
		try {
			config = await getDbControlConfigFromSource();
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
