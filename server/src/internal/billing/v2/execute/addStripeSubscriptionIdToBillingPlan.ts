import {
	type AutumnBillingPlan,
	cp,
	PooledBalanceResetOwnerType,
} from "@autumn/shared";
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
		for (const pooledBalanceOperation of autumnBillingPlan.pooledBalanceOps ??
			[]) {
			if (
				(pooledBalanceOperation.op !== "upsert_source" &&
					pooledBalanceOperation.op !== "transfer_source") ||
				pooledBalanceOperation.sourceCustomerProductId !== customerProduct.id ||
				pooledBalanceOperation.resetOwnerType !==
					PooledBalanceResetOwnerType.Subscription
			) {
				continue;
			}

			pooledBalanceOperation.resetOwnerId = stripeSubscriptionId;
		}
	}
};
