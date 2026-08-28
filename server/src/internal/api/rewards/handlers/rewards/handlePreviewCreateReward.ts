import { CreateRewardParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { catalogActions } from "@/internal/catalog/actions/index.js";

/** Resolve a proposed reward WITHOUT persisting, via the catalog config
 * preview, so a live preview matches what `rewards.create` would apply. */
export const handlePreviewCreateReward = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: CreateRewardParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const response = await catalogActions.previewUpdate({
			ctx,
			params: {
				features: [],
				plans: [],
				rewards: [params],
				skip_deletions: true,
				skip_feature_ids: [],
				skip_plan_ids: [],
			},
		});
		return c.json({ reward_changes: response.reward_changes });
	},
});
