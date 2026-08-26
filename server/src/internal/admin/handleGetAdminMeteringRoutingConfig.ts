import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { readMeteringWorkerUrl } from "@/internal/metering/routing/meteringRouting.js";
import {
	getMeteringRoutingConfigFromSource,
	getRuntimeMeteringRoutingStatus,
} from "@/internal/misc/meteringRouting/meteringRoutingStore.js";

export const handleGetAdminMeteringRoutingConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeMeteringRoutingStatus();
		const config = await getMeteringRoutingConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
			// Without this the config is inert no matter what it says, so the
			// dashboard has to be able to see it.
			workerUrlConfigured: readMeteringWorkerUrl() !== null,
		});
	},
});
