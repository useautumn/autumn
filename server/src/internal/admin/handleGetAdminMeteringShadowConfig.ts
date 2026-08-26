import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getShadowTapRuntimeStatus } from "@/internal/metering/shadow/shadowTap.js";
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
			// Counters belong to the process that answers this request, not the
			// fleet: an admin read reports one server's mirror, so treat a zero
			// as "not this box" rather than "nothing mirrored anywhere".
			runtime: getShadowTapRuntimeStatus(),
		});
	},
});
