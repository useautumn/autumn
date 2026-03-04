import {
	ErrCode,
	findFeatureById,
	notNullish,
	nullish,
	RecaseError,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runUpdateBalanceV2 } from "@/internal/balances/updateBalance/runUpdateBalanceV2";
import { runUpdateUsage } from "@/internal/balances/updateBalance/runUpdateUsage";
import { updateGrantedBalance } from "@/internal/balances/updateBalance/updateGrantedBalance";
import { updateNextResetAt } from "@/internal/balances/updateBalance/updateNextResetAt";
import { buildCustomerEntitlementFilters } from "@/internal/balances/utils/buildCustomerEntitlementFilters";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer";

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

		let fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId: params.customer_id,
			entityId: params.entity_id,
			source: "handleUpdateBalance",
		});

		const targetBalance = params.remaining ?? params.current_balance;
		if (notNullish(params.add_to_balance) || notNullish(targetBalance)) {
			const result = await runUpdateBalanceV2({ ctx, params, fullCustomer });
			fullCustomer = result?.fullCus ?? fullCustomer;
		}

		if (notNullish(params.usage)) {
			const result = await runUpdateUsage({ ctx, params, fullCustomer });
			fullCustomer = result?.fullCus ?? fullCustomer;
		}

		if (notNullish(params.included_grant)) {
			if (nullish(params.current_balance)) {
				throw new RecaseError({
					message: "current_balance is required when updating granted balance",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}

			ctx.logger.info(
				`updating granted balance for feature ${params.feature_id} to ${params.included_grant}`,
			);

			const customerEntitlementFilters = buildCustomerEntitlementFilters({
				params,
			});

			await updateGrantedBalance({
				ctx,
				fullCustomer,
				featureId: params.feature_id,
				targetGrantedBalance: params.included_grant,
				customerEntitlementFilters,
			});
		}

		if (notNullish(params.next_reset_at)) {
			const customerEntitlementFilters = buildCustomerEntitlementFilters({
				params,
			});

			await updateNextResetAt({
				ctx,
				fullCustomer,
				featureId: params.feature_id,
				nextResetAt: params.next_reset_at,
				customerEntitlementFilters,
			});
		}

		return c.json({ success: true });
	},
});
