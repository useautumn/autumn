import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FullSubjectGateEdgeConfigSchema } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigSchemas.js";
import { updateFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

export const handleUpsertAdminFullSubjectGateConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: FullSubjectGateEdgeConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		await updateFullSubjectGateConfig({ config: body });
		return c.json({ success: true });
	},
});
