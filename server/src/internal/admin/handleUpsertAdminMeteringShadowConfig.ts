import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MeteringShadowConfigSchema } from "@/internal/misc/meteringShadow/meteringShadowSchemas.js";
import { updateFullMeteringShadowConfig } from "@/internal/misc/meteringShadow/meteringShadowStore.js";

export const handleUpsertAdminMeteringShadowConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: MeteringShadowConfigSchema,
	handler: async (c) => {
		await updateFullMeteringShadowConfig({ config: c.req.valid("json") });
		return c.json({ success: true });
	},
});
