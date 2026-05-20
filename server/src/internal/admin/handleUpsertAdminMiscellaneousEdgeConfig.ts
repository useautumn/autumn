import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import { updateFullMiscellaneousEdgeConfig } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

export const handleUpsertAdminMiscellaneousEdgeConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: MiscellaneousEdgeConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullMiscellaneousEdgeConfig({ config: body });

		return c.json({ success: true });
	},
});
