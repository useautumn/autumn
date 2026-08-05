import {
	findFeatureById,
	notNullish,
	RecaseError,
	RouteGroup,
	Scopes,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { updateBalanceV2 } from "@/internal/balances/updateBalance/v2/updateBalanceV2.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/edgeConfigs/rollouts/fullSubjectRolloutUtils.js";

export const handleUpdateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: UpdateBalanceParamsV0Schema.extend({}),

	handler: async (c) => {
		const params = c.req.valid("json");
		const ctx = c.get("ctx");

		if (params.feature_id) {
			findFeatureById({
				features: ctx.features,
				featureId: params.feature_id,
				errorOnNotFound: true,
			});
		}

		if (notNullish(params.expires_at) && params.expires_at <= Date.now()) {
			throw new RecaseError({
				message: "expires_at must be in the future",
				statusCode: 400,
			});
		}

		const targetBalance = params.remaining ?? params.current_balance;

		if (isFullSubjectRolloutEnabled({ ctx })) {
		}

		await updateBalanceV2({ ctx, params, targetBalance });

		return c.json({ success: true });
	},
});
