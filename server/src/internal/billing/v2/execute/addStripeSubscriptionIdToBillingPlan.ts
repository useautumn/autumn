import { type AutumnBillingPlan, cp } from "@autumn/shared";
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
	const linkedCustomerProductIds = new Set<string>();
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();

		if (!isPaidRecurring && !customerProductHasPaidLicenses(customerProduct)) {
			continue;
		}

		customerProduct.subscription_ids = [stripeSubscriptionId];
		linkedCustomerProductIds.add(customerProduct.id);
	}

	for (const update of getPatchedCustomerProductUpdates({
		autumnBillingPlan,
	})) {
		update.updates.subscription_ids = [stripeSubscriptionId];
		linkedCustomerProductIds.add(update.customerProduct.id);
	}

	for (const upsertSource of autumnBillingPlan.pooledBalancePlan
		?.upsertSources ?? []) {
		const { contribution } = upsertSource;
		if (
			!linkedCustomerProductIds.has(contribution.sourceCustomerProductId) ||
			contribution.stripeSubscriptionId === null
		) {
			continue;
		}

		contribution.stripeSubscriptionId = stripeSubscriptionId;
	}

	for (const pooledBalanceOperation of autumnBillingPlan.pooledBalanceOps ??
		[]) {
		if (
			(pooledBalanceOperation.op !== "upsert_source" &&
				pooledBalanceOperation.op !== "transfer_source") ||
			!linkedCustomerProductIds.has(
				pooledBalanceOperation.sourceCustomerProductId,
			) ||
			pooledBalanceOperation.stripeSubscriptionId === null
		) {
			continue;
		}

		pooledBalanceOperation.stripeSubscriptionId = stripeSubscriptionId;
	}
};
