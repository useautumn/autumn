import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { JobQueueConfigSchema } from "@/internal/misc/jobQueues/jobQueueSchemas.js";
import { updateFullJobQueueConfig } from "@/internal/misc/jobQueues/jobQueueStore.js";

export const handleUpsertAdminJobQueueConfig = createRoute({
	body: JobQueueConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullJobQueueConfig({ config: body });

		return c.json({ success: true });
	},
});
