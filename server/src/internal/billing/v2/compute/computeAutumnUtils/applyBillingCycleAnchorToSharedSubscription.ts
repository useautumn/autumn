import {
	type AutumnBillingPlan,
	type BillingContext,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import { computeBillingCycleAnchorEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeBillingCycleAnchorEntitlementUpdates";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { customerProductToBillingCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

export const applyBillingCycleAnchorToSharedSubscription = ({
	plan,
	billingContext,
	stripeSubscriptionId = billingContext.stripeSubscription?.id,
	targetCustomerProduct,
}: {
	plan: AutumnBillingPlan;
	billingContext: BillingContext;
	stripeSubscriptionId?: string;
	targetCustomerProduct?: FullCusProduct;
}): AutumnBillingPlan => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return plan;
	if (!stripeSubscriptionId && !targetCustomerProduct) return plan;

	const finalCustomer = applyAutumnBillingPlanToFullCustomer({
		fullCustomer: billingContext.fullCustomer,
		autumnBillingPlan: plan,
	});
	const finalCustomerProductById = new Map(
		finalCustomer.customer_products.map((customerProduct) => [
			customerProduct.id,
			customerProduct,
		]),
	);
	const relatedCustomerProducts = stripeSubscriptionId
		? filterCustomerProductsByStripeSubscriptionId({
				customerProducts: billingContext.fullCustomer.customer_products,
				stripeSubscriptionId,
			})
		: [targetCustomerProduct!];
	const customerProductUpdateById = new Map(
		getUpdateCustomerProducts({ autumnBillingPlan: plan }).map((update) => [
			update.customerProduct.id,
			update,
		]),
	);
	const entitlementUpdateById = new Map(
		(plan.updateCustomerEntitlements ?? []).map((update) => [
			update.customerEntitlement.id,
			update,
		]),
	);
	const scheduledResetAt = getRequestedBillingCycleAnchorResetAt({
		requestedBillingCycleAnchor: billingContext.requestedBillingCycleAnchor,
	});

	for (const customerProduct of relatedCustomerProducts) {
		const finalCustomerProduct = finalCustomerProductById.get(
			customerProduct.id,
		);
		const remainsRelevant =
			customerProductHasRelevantStatus(finalCustomerProduct);
		const anchorUpdates = remainsRelevant
			? scheduledResetAt === undefined
				? {
						billing_cycle_anchor: customerProductToBillingCycleAnchor({
							customerProduct,
							billingCycleAnchor: billingContext.billingCycleAnchorMs,
							now: billingContext.currentEpochMs,
						}),
						billing_cycle_anchor_resets_at: null,
					}
				: { billing_cycle_anchor_resets_at: scheduledResetAt }
			: { billing_cycle_anchor_resets_at: null };
		const existingCustomerProductUpdate = customerProductUpdateById.get(
			customerProduct.id,
		);
		customerProductUpdateById.set(customerProduct.id, {
			customerProduct,
			updates: {
				...existingCustomerProductUpdate?.updates,
				...anchorUpdates,
			},
		});

		if (!remainsRelevant) continue;
		const entitlementUpdates = computeBillingCycleAnchorEntitlementUpdates({
			billingContext,
			customerProduct: finalCustomerProduct!,
		});
		for (const entitlementUpdate of entitlementUpdates) {
			const existingEntitlementUpdate = entitlementUpdateById.get(
				entitlementUpdate.customerEntitlement.id,
			);
			entitlementUpdateById.set(entitlementUpdate.customerEntitlement.id, {
				customerEntitlement: entitlementUpdate.customerEntitlement,
				updates: {
					...existingEntitlementUpdate?.updates,
					...entitlementUpdate.updates,
				},
			});
		}
	}

	return {
		...plan,
		updateCustomerProduct: undefined,
		updateCustomerProducts: Array.from(customerProductUpdateById.values()),
		updateCustomerEntitlements: Array.from(entitlementUpdateById.values()),
	};
};
