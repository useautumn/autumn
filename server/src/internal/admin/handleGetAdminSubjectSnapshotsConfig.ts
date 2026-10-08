import { subjectSnapshotsEdgeConfig } from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { subjectSnapshotsStore } from "@/internal/misc/subjectSnapshots/subjectSnapshotsStore.js";

export const handleGetAdminSubjectSnapshotsConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		try {
			const config = await subjectSnapshotsStore.readFromSource();
			return c.json({ ...config, configHealthy: true, error: null });
		} catch (error) {
			return c.json({
				...subjectSnapshotsEdgeConfig.defaultValue(),
				configHealthy: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
});
