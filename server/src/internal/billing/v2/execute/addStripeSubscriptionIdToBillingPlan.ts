import type { AutumnBillingPlan } from "@autumn/shared";
import { cp, PooledBalanceResetMode, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getPatchedCustomerProductUpdates } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { customerProductHasPaidLicenses } from "@/internal/billing/v2/utils/customerProductHasPaidLicenses.js";

export const addStripeSubscriptionIdToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionId,
	billingCycleAnchorMs,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionId: string;
	billingCycleAnchorMs?: number;
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

	for (const pooledCustomerEntitlement of autumnBillingPlan.pooledBalancePlan
		?.insertPoolBalances ?? []) {
		const pooledBalance = pooledCustomerEntitlement.pooled_balance;
		if (pooledBalance?.reset_mode === PooledBalanceResetMode.Subscription) {
			pooledBalance.stripe_subscription_id = stripeSubscriptionId;
		}
	}

	for (const transition of autumnBillingPlan.customerLicenseTransitions ?? []) {
		transition.billingCycleAnchorMs ??= billingCycleAnchorMs;
	}
};

export const addStripeSubscriptionToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscription,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscription: Stripe.Subscription;
}) =>
	addStripeSubscriptionIdToBillingPlan({
		autumnBillingPlan,
		stripeSubscriptionId: stripeSubscription.id,
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
	});
