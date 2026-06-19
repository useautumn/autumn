import {
	AffectedResource,
	BatchTrackParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runBatchTrack } from "@/internal/balances/track/runBatchTrack.js";

export const handleBatchTrack = createRoute({
	scopes: [Scopes.Balances.Write],
	body: BatchTrackParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		await runBatchTrack({ ctx, body });

		return c.json({ success: true }, 200);
	},
});
