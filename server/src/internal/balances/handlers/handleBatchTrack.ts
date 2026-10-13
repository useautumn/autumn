import {
	AffectedResource,
	ApiVersion,
	BatchTrackParamsSchema,
	BatchTrackParamsV2_4Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runBatchTrackByRollout } from "@/internal/balances/track/runBatchTrackByRollout.js";

export const handleBatchTrack = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	versionedBody: {
		latest: BatchTrackParamsSchema,
		[ApiVersion.V2_4]: BatchTrackParamsV2_4Schema,
	},
	resource: AffectedResource.BatchTrack,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		await runBatchTrackByRollout({ ctx, body });

		return c.json({ success: true }, 200);
	},
});
