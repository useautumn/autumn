import {
	findFeatureById,
	notNullish,
	RecaseError,
	RouteGroup,
	Scopes,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { checkRouteApproval } from "@/internal/approvals/enforce/checkRouteApproval";
import { updateBalanceParamsToFacts } from "@/internal/approvals/facts/balances/updateBalanceParamsToFacts";
import { updateBalanceV2 } from "@/internal/balances/updateBalance/v2/updateBalanceV2.js";
import { getSubjectFullCustomer } from "@/internal/balances/utils/getSubjectFullCustomer.js";

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

		await checkRouteApproval({
			ctx,
			action: "balances.update",
			buildFacts: async () =>
				updateBalanceParamsToFacts({
					fullCustomer: await getSubjectFullCustomer({
						ctx,
						customerId: params.customer_id,
						entityId: params.entity_id,
						source: "handleUpdateBalance",
					}),
					params,
				}),
		});

		const targetBalance = params.remaining ?? params.current_balance;

		await updateBalanceV2({ ctx, params, targetBalance });

		return c.json({ success: true });
	},
});
