import {
	AffectedResource,
	ApiVersion,
	BatchTrackTokensParamsSchema,
	BatchTrackTokensParamsV2_4Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runBatchTrackTokens } from "@/internal/balances/track/runBatchTrackTokens.js";

export const handleBatchTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	versionedBody: {
		latest: BatchTrackTokensParamsSchema,
		[ApiVersion.V2_4]: BatchTrackTokensParamsV2_4Schema,
	},
	resource: AffectedResource.BatchTrackTokens,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		await runBatchTrackTokens({ ctx, body });

		return c.json({ success: true }, 200);
	},
});
