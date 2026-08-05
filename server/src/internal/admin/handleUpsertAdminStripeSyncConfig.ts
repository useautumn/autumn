import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { StripeSyncConfigSchema } from "@/internal/misc/edgeConfigs/stripeSync/stripeSyncSchemas.js";
import { updateFullStripeSyncConfig } from "@/internal/misc/edgeConfigs/stripeSync/stripeSyncStore.js";

export const handleUpsertAdminStripeSyncConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: StripeSyncConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullStripeSyncConfig({ config: body });

		return c.json({ success: true });
	},
});
