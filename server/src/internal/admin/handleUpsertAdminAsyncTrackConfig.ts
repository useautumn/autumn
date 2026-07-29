import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { AsyncTrackConfigSchema } from "@/internal/misc/asyncTrack/asyncTrackSchemas.js";
import { updateFullAsyncTrackConfig } from "@/internal/misc/asyncTrack/asyncTrackStore.js";

export const handleUpsertAdminAsyncTrackConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: AsyncTrackConfigSchema,
	handler: async (c) => {
		await updateFullAsyncTrackConfig({ config: c.req.valid("json") });
		return c.json({ success: true });
	},
});
