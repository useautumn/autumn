import {
	type AutumnBillingPlan,
	findCustomerProductById,
	InternalError,
	isPooledBalanceSourceCustomerEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRetainedCustomerEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeRetainedCustomerEntitlementUpdates.js";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import { getCurrentBillingCycleAnchorMs } from "@/internal/billing/v2/utils/billingContext/getCurrentBillingCycleAnchorMs.js";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems.js";
import { getRefundLineItems } from "@/internal/billing/v2/utils/lineItems/getRefundLineItems.js";

/** Starts a recurring period at the final quantities while retaining product identity. */
export const computeUpdateQuantityAnchorResetPlan = ({
	ctx,
	billingContext,
	plan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	const finalCustomerProduct = findCustomerProductById({
		fullCustomer: autumnBillingPlanToFinalFullCustomer({
			billingContext,
			autumnBillingPlan: plan,
		}),
		customerProductId: billingContext.customerProduct.id,
	});
	if (!finalCustomerProduct) {
		throw new InternalError({
			message: "Quantity reset is missing its projected customer product.",
		});
	}
	const retainedUpdates = computeRetainedCustomerEntitlementUpdates({
		updateSubscriptionContext: {
			...billingContext,
			featureQuantities: finalCustomerProduct.options,
		},
		finalCustomerProduct,
	});
	const entitlementUpdates = new Map(
		(plan.updateCustomerEntitlements ?? []).map((update) => [
			update.customerEntitlement.id,
			update,
		]),
	);
	for (const update of retainedUpdates ?? []) {
		// The pooled finalizer resets shared usage; contributing source balances stay zero.
		if (
			isPooledBalanceSourceCustomerEntitlement({
				customerEntitlement: update.customerEntitlement,
			})
		)
			continue;
		const existing = entitlementUpdates.get(update.customerEntitlement.id);
		entitlementUpdates.set(update.customerEntitlement.id, {
			...update,
			updates: { ...existing?.updates, ...update.updates },
		});
	}

	return {
		...plan,
		updateCustomerEntitlements: Array.from(entitlementUpdates.values()),
		lineItems: [
			...getRefundLineItems({
				ctx,
				customerProduct: billingContext.customerProduct,
				billingContext: {
					...billingContext,
					billingCycleAnchorMs: getCurrentBillingCycleAnchorMs({
						billingContext,
					}),
				},
				priceFilters: { excludeOneOffPrices: true },
			}),
			...customerProductToLineItems({
				ctx,
				customerProduct: finalCustomerProduct,
				billingContext,
				direction: "charge",
				priceFilters: { excludeOneOffPrices: true },
			}),
		],
	};
};
