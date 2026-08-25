import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getMeteringShadowConfigFromSource,
	getRuntimeMeteringShadowStatus,
} from "@/internal/misc/meteringShadow/meteringShadowStore.js";

export const handleGetAdminMeteringShadowConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeMeteringShadowStatus();
		const config = await getMeteringShadowConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
