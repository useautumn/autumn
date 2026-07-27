import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RESET_JOB_V2_CONFIG_LIMITS } from "@/internal/misc/resetJobV2/resetJobV2Schemas.js";
import {
	getResetJobV2ConfigFromSource,
	getResetJobV2ConfigStatus,
} from "@/internal/misc/resetJobV2/resetJobV2Store.js";

export const handleGetAdminResetJobV2Config = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getResetJobV2ConfigStatus();
		const config = await getResetJobV2ConfigFromSource();

		return c.json({
			...config,
			limits: RESET_JOB_V2_CONFIG_LIMITS,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
