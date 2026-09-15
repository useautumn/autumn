import {
	type AutumnBillingPlan,
	PooledBalanceResetMode,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { computeBillingCycleAnchorEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeBillingCycleAnchorEntitlementUpdates.js";

/** Schedules subscription pools without changing their current grant or deferred contributions. */
export const computeUpdateQuantityScheduledAnchorPlan = ({
	plan,
	billingContext,
}: {
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const pools = (
		billingContext.fullCustomer.pooled_customer_entitlements ?? []
	).filter(
		(customerEntitlement) =>
			customerEntitlement.pooled_balance?.reset_mode ===
				PooledBalanceResetMode.Subscription &&
			customerEntitlement.pooled_balance.stripe_subscription_id ===
				billingContext.stripeSubscription?.id,
	);
	const updates = new Map(
		(plan.updateCustomerEntitlements ?? []).map((update) => [
			update.customerEntitlement.id,
			update,
		]),
	);
	for (const update of computeBillingCycleAnchorEntitlementUpdates({
		billingContext,
		customerProduct: {
			...billingContext.customerProduct,
			customer_entitlements: pools,
		},
	})) {
		updates.set(update.customerEntitlement.id, {
			...update,
			updates: {
				...updates.get(update.customerEntitlement.id)?.updates,
				...update.updates,
			},
		});
	}
	return { ...plan, updateCustomerEntitlements: Array.from(updates.values()) };
};
