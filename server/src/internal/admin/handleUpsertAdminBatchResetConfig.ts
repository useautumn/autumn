import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { BatchResetConfigSchema } from "@/internal/misc/edgeConfigs/batchReset/batchResetConfigSchemas.js";
import { updateFullBatchResetConfig } from "@/internal/misc/edgeConfigs/batchReset/batchResetConfigStore.js";

export const handleUpsertAdminBatchResetConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: BatchResetConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullBatchResetConfig({ config: body });

		return c.json({ success: true });
	},
});
