import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { OrgLimitsConfigSchema } from "@/internal/misc/edgeConfig/orgLimitsSchemas.js";
import { updateFullOrgLimitsConfig } from "@/internal/misc/edgeConfig/orgLimitsStore.js";

export const handleUpsertAdminOrgLimitsConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: OrgLimitsConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullOrgLimitsConfig({ config: body });

		return c.json({ success: true });
	},
});
