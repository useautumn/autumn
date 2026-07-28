import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getAsyncTrackConfigFromSource,
	getRuntimeAsyncTrackStatus,
} from "@/internal/misc/asyncTrack/asyncTrackStore.js";

export const handleGetAdminAsyncTrackConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeAsyncTrackStatus();
		const config = await getAsyncTrackConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
