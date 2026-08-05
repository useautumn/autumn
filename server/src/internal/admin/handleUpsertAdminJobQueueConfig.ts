import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { JobQueueConfigSchema } from "@/internal/misc/edgeConfigs/jobQueues/jobQueueSchemas.js";
import { updateFullJobQueueConfig } from "@/internal/misc/edgeConfigs/jobQueues/jobQueueStore.js";

export const handleUpsertAdminJobQueueConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: JobQueueConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullJobQueueConfig({ config: body });

		return c.json({ success: true });
	},
});
