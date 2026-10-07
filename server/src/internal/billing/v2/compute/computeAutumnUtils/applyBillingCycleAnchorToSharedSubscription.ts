import {
	type AutumnBillingPlan,
	type BillingContext,
	customerProductHasActiveStatus,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	type LineItem,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeBillingCycleAnchorEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeBillingCycleAnchorEntitlementUpdates";
import { computeSharedSubscriptionResetBilling } from "@/internal/billing/v2/compute/computeAutumnUtils/computeSharedSubscriptionResetBilling";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { customerProductToBillingCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

export const applyBillingCycleAnchorToSharedSubscription = ({
	ctx,
	plan,
	billingContext,
	stripeSubscriptionId = billingContext.stripeSubscription?.id,
	targetCustomerProduct,
	rebillsUnchangedPlansAtReset = false,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: BillingContext;
	stripeSubscriptionId?: string;
	targetCustomerProduct?: FullCusProduct;
	/** set_plans only: a reset now also bills the subscription's plans the request leaves unchanged. */
	rebillsUnchangedPlansAtReset?: boolean;
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
	const mergeEntitlementUpdate = ({
		customerEntitlement,
		updates,
	}: UpdateCustomerEntitlement) => {
		entitlementUpdateById.set(customerEntitlement.id, {
			customerEntitlement,
			updates: {
				...entitlementUpdateById.get(customerEntitlement.id)?.updates,
				...updates,
			},
		});
	};

	// Stripe re-bills every item when the cycle resets now; under none it only moves the period.
	const rebillsUnchangedPlans =
		rebillsUnchangedPlansAtReset &&
		billingContext.requestedBillingCycleAnchor === "now" &&
		billingContext.requestedProrationBehavior !== "none";
	const isRebilledByReset = (customerProduct: FullCusProduct) =>
		rebillsUnchangedPlans &&
		!customerProductUpdateById.has(customerProduct.id) &&
		customerProduct.id !== targetCustomerProduct?.id &&
		customerProductHasActiveStatus(
			finalCustomerProductById.get(customerProduct.id),
		);
	// Before the anchor updates below, which must win on next_reset_at.
	const resetLineItems: LineItem[] = [];
	for (const customerProduct of relatedCustomerProducts.filter(
		isRebilledByReset,
	)) {
		const resetBilling = computeSharedSubscriptionResetBilling({
			ctx,
			billingContext,
			customerProduct,
		});
		resetLineItems.push(...resetBilling.lineItems);
		resetBilling.updateCustomerEntitlements.forEach(mergeEntitlementUpdate);
	}

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
		entitlementUpdates.forEach(mergeEntitlementUpdate);
	}

	return {
		...plan,
		lineItems: [...(plan.lineItems ?? []), ...resetLineItems],
		updateCustomerProduct: undefined,
		updateCustomerProducts: Array.from(customerProductUpdateById.values()),
		updateCustomerEntitlements: Array.from(entitlementUpdateById.values()),
	};
};
