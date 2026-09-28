import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ResetJobConfigSchema } from "@/internal/misc/resetJob/resetJobSchemas.js";
import { updateResetJobConfig } from "@/internal/misc/resetJob/resetJobStore.js";

export const handleUpsertAdminResetJobConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: ResetJobConfigSchema,
	handler: async (c) => {
		const config = c.req.valid("json");

		await updateResetJobConfig({ config });

		return c.json({ success: true });
	},
});
