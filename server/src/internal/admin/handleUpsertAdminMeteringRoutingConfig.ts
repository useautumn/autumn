import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MeteringRoutingConfigSchema } from "@/internal/misc/meteringRouting/meteringRoutingSchemas.js";
import { updateFullMeteringRoutingConfig } from "@/internal/misc/meteringRouting/meteringRoutingStore.js";

export const handleUpsertAdminMeteringRoutingConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: MeteringRoutingConfigSchema,
	handler: async (c) => {
		await updateFullMeteringRoutingConfig({ config: c.req.valid("json") });
		return c.json({ success: true });
	},
});
