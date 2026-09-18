import { DbControlEdgeConfigSchema } from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateDbControlConfig } from "@/internal/misc/dbControl/dbControlStore.js";

export const handleUpsertAdminDbControlConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: DbControlEdgeConfigSchema,
	handler: async (c) => {
		await updateDbControlConfig({ config: c.req.valid("json") });
		return c.json({ success: true });
	},
});
