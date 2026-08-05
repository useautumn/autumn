import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ResetJobV2ConfigSchema } from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Schemas.js";
import { updateResetJobV2Config } from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Store.js";

export const handleUpsertAdminResetJobV2Config = createRoute({
	scopes: [Scopes.Superuser],
	body: ResetJobV2ConfigSchema,
	handler: async (c) => {
		const config = c.req.valid("json");

		await updateResetJobV2Config({ config });

		return c.json({ success: true });
	},
});
