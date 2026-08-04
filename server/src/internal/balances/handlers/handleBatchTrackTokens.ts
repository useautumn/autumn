import {
	AffectedResource,
	BatchTrackTokensParamsSchema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runBatchTrackTokens } from "@/internal/balances/track/runBatchTrackTokens.js";

export const handleBatchTrackTokens = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: BatchTrackTokensParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		await runBatchTrackTokens({ ctx, body });

		return c.json({ success: true }, 200);
	},
});
