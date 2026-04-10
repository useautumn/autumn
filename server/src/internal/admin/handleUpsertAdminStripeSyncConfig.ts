import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { StripeSyncConfigSchema } from "@/internal/misc/stripeSync/stripeSyncSchemas.js";
import { updateFullStripeSyncConfig } from "@/internal/misc/stripeSync/stripeSyncStore.js";

export const handleUpsertAdminStripeSyncConfig = createRoute({
	body: StripeSyncConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullStripeSyncConfig({ config: body });

		return c.json({ success: true });
	},
});
