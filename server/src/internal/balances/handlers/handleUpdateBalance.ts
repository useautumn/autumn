import {
	ErrCode,
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
import { buildCustomerEntitlementFilters } from "@/internal/balances/utils/buildCustomerEntitlementFilters";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

export const handleUpdateBalance = createRoute({
	body: UpdateBalanceParamsV0Schema.extend({}),

	handler: async (c) => {
		const params = c.req.valid("json");
		const ctx = c.get("ctx");

		const targetBalance = params.remaining ?? params.current_balance;
		if (notNullish(params.add_to_balance) || notNullish(targetBalance)) {
			await runUpdateBalanceV2({ ctx, params });
		}

		if (notNullish(params.usage)) {
			await runUpdateUsage({ ctx, params });
		}

		if (notNullish(params.granted_balance)) {
			if (nullish(params.current_balance)) {
				throw new RecaseError({
					message: "current_balance is required when updating granted balance",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}

			ctx.logger.info(
				`updating granted balance for feature ${params.feature_id} to ${params.granted_balance}`,
			);

			const customerEntitlementFilters = buildCustomerEntitlementFilters({
				params,
			});

			const fullCus = await CusService.getFull({
				ctx,
				idOrInternalId: params.customer_id,
				entityId: params.entity_id,
				withEntities: true,
			});

			await updateGrantedBalance({
				ctx,
				fullCus,
				featureId: params.feature_id,
				targetGrantedBalance: params.granted_balance,
				customerEntitlementFilters,
			});
		}

		if (notNullish(params.next_reset_at) && params.customer_entitlement_id) {
			await CusEntService.update({
				ctx,
				id: params.customer_entitlement_id,
				updates: {
					next_reset_at: params.next_reset_at,
				},
			});

			await deleteCachedApiCustomer({
				ctx,
				customerId: params.customer_id,
				source: `handleUpdateBalance, updating next_reset_at`,
			});
		}

		return c.json({ success: true });
	},
});
