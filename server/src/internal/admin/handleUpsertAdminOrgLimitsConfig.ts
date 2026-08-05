import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgLimitsConfigSchema } from "@/internal/misc/edgeConfigs/orgLimits/orgLimitsSchemas.js";
import { updateFullOrgLimitsConfig } from "@/internal/misc/edgeConfigs/orgLimits/orgLimitsStore.js";

export const handleUpsertAdminOrgLimitsConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: OrgLimitsConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullOrgLimitsConfig({ config: body });

		return c.json({ success: true });
	},
});
