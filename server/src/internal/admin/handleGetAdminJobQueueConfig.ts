import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import {
	getJobQueueConfigFromSource,
	getJobQueueConfigStatus,
	KNOWN_JOB_QUEUES,
} from "@/internal/misc/jobQueues/jobQueueStore.js";

export const handleGetAdminJobQueueConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getJobQueueConfigStatus();
		const config = await getJobQueueConfigFromSource();

		return c.json({
			...config,
			knownQueues: KNOWN_JOB_QUEUES,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
