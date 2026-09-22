import {
	AffectedResource,
	BatchTrackParamsSchema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runBalanceWorkerBatchTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerBatchTrack.js";
import { runBatchTrack } from "@/internal/balances/track/runBatchTrack.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

export const handleBatchTrack = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: BatchTrackParamsSchema,
	resource: AffectedResource.Track,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		if (isBalanceWorkerRolloutEnabled()) {
			await runBalanceWorkerBatchTrack({ ctx, body });
		} else {
			await runBatchTrack({ ctx, body });
		}

		return c.json({ success: true }, 200);
	},
});
