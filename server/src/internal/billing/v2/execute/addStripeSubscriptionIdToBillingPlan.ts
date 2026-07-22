import type { AutumnBillingPlan } from "@autumn/shared";
import { cp, PooledBalanceResetMode } from "@autumn/shared";
import { getPatchedCustomerProductUpdates } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { getChangedPooledBalances } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan.js";
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

	for (const pooledCustomerEntitlement of getChangedPooledBalances({
		autumnBillingPlan,
	})) {
		const pooledBalance = pooledCustomerEntitlement.pooled_balance;
		if (pooledBalance?.reset_mode === PooledBalanceResetMode.Subscription) {
			pooledBalance.stripe_subscription_id = stripeSubscriptionId;
		}
	}
};
