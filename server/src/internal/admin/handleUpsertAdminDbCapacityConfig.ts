import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { DbCapacityConfigSchema } from "@/internal/misc/dbCapacity/dbCapacityConfigSchemas.js";
import { updateDbCapacityConfig } from "@/internal/misc/dbCapacity/dbCapacityConfigStore.js";

export const handleUpsertAdminDbCapacityConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: DbCapacityConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		await updateDbCapacityConfig({ config: body });
		return c.json({ success: true });
	},
});
