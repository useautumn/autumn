import {
	findFeatureById,
	notNullish,
	RecaseError,
	Scopes,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { updateBalanceV1 } from "@/internal/balances/updateBalance/updateBalanceV1.js";
import { updateBalanceV2 } from "@/internal/balances/updateBalance/v2/updateBalanceV2.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

export const handleUpdateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
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

		// A non-future expiry immediately filters the balance out of the
		// customer's active entitlements (see fullCustomerToCustomerEntitlements'
		// `expires_at > now` guard) — and once filtered it can no longer be
		// targeted to undo. Reject it, mirroring create's next_reset_at rule.
		if (notNullish(params.expires_at) && params.expires_at <= Date.now()) {
			throw new RecaseError({
				message: "expires_at must be in the future",
				statusCode: 400,
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
