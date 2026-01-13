import {
	ErrCode,
	notNullish,
	nullish,
	RecaseError,
	UpdateBalanceParamsSchema,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runUpdateBalanceV2 } from "@/internal/balances/updateBalance/runUpdateBalanceV2";
import { updateGrantedBalance } from "@/internal/balances/updateBalance/updateGrantedBalance";
import { buildCustomerEntitlementFilters } from "@/internal/balances/utils/buildCustomerEntitlementFilters";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

export const handleUpdateBalance = createRoute({
	body: UpdateBalanceParamsSchema.extend({}),

	handler: async (c) => {
		const params = c.req.valid("json");
		const ctx = c.get("ctx");

		if (
			notNullish(params.add_to_balance) ||
			notNullish(params.current_balance)
		) {
			await runUpdateBalanceV2({ ctx, params });
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
				db: ctx.db,
				idOrInternalId: params.customer_id,
				orgId: ctx.org.id,
				env: ctx.env,
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
				db: ctx.db,
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
