import {
	customerEntitlements,
	customerProducts,
	customers,
	ErrCode,
	notNullish,
	nullish,
	RecaseError,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runUpdateBalanceV2 } from "@/internal/balances/updateBalance/runUpdateBalanceV2";
import { runUpdateUsage } from "@/internal/balances/updateBalance/runUpdateUsage";
import { updateGrantedBalance } from "@/internal/balances/updateBalance/updateGrantedBalance";
import { buildCustomerEntitlementFilters } from "@/internal/balances/utils/buildCustomerEntitlementFilters";
import { CusService } from "@/internal/customers/CusService";
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
			// Update only if the entitlement belongs to the authenticated org
			// (scoped via customer_entitlements → customer_products → customers.org_id)
			const orgScopedCusEntIds = ctx.db
				.select({ id: customerEntitlements.id })
				.from(customerEntitlements)
				.innerJoin(
					customerProducts,
					eq(
						customerEntitlements.customer_product_id,
						customerProducts.id,
					),
				)
				.innerJoin(
					customers,
					eq(
						customerProducts.internal_customer_id,
						customers.internal_id,
					),
				)
				.where(
					and(
						eq(customerEntitlements.id, params.customer_entitlement_id),
						eq(customers.org_id, ctx.org.id),
						eq(customers.env, ctx.env),
					),
				);

			const updated = await ctx.db
				.update(customerEntitlements)
				.set({
					next_reset_at: params.next_reset_at,
				})
				.where(inArray(customerEntitlements.id, orgScopedCusEntIds))
				.returning({ id: customerEntitlements.id });

			if (updated.length === 0) {
				throw new RecaseError({
					message: "Customer entitlement not found",
					code: ErrCode.CustomerEntitlementNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			await deleteCachedApiCustomer({
				ctx,
				customerId: params.customer_id,
				source: `handleUpdateBalance, updating next_reset_at`,
			});
		}

		return c.json({ success: true });
	},
});
