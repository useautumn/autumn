import { findFeatureById, UpdateBalanceParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { updateBalanceV1 } from "@/internal/balances/updateBalance/updateBalanceV1.js";
import { updateBalanceV2 } from "@/internal/balances/updateBalance/v2/updateBalanceV2.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

export const handleUpdateBalance = createRoute({
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

		const targetBalance = params.remaining ?? params.current_balance;

		if (isFullSubjectRolloutEnabled({ ctx })) {
			await updateBalanceV2({ ctx, params, targetBalance });
		} else {
			await updateBalanceV1({ ctx, params, targetBalance });
		}

		return c.json({ success: true });
	},
});
