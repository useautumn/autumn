import type { AutumnBillingPlan } from "@autumn/shared";
import { cp, PooledBalanceResetMode } from "@autumn/shared";
import { getPatchedCustomerProductUpdates } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { customerProductHasPaidLicenses } from "@/internal/billing/v2/utils/customerProductHasPaidLicenses.js";

/**
 * Adds a Stripe subscription ID to a billing plan.
 * @param billingPlan - The billing plan to add the Stripe subscription ID to.
 * @param stripeSubscriptionId - The Stripe subscription ID to add.
 */
export const addStripeSubscriptionIdToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();

		if (!isPaidRecurring && !customerProductHasPaidLicenses(customerProduct)) {
			continue;
		}

		customerProduct.subscription_ids = [stripeSubscriptionId];
	}

	for (const update of getPatchedCustomerProductUpdates({
		autumnBillingPlan,
	})) {
		update.updates.subscription_ids = [stripeSubscriptionId];
	}

	// Inserts only: a pool matched by identity already carries the subscription
	// it belongs to, and restamping an outgoing pool moves it onto an identity
	// another live pool holds.
	for (const pooledCustomerEntitlement of autumnBillingPlan.pooledBalancePlan
		?.insertPoolBalances ?? []) {
		const pooledBalance = pooledCustomerEntitlement.pooled_balance;
		if (pooledBalance?.reset_mode === PooledBalanceResetMode.Subscription) {
			pooledBalance.stripe_subscription_id = stripeSubscriptionId;
		}
	}
};
