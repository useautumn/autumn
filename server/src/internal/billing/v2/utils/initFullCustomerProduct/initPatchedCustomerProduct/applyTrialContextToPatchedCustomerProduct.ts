import type {
	AutumnBillingPlan,
	FullCusProduct,
	TrialContext,
} from "@autumn/shared";

export type PatchedCustomerProductUpdates = NonNullable<
	NonNullable<AutumnBillingPlan["updateCustomerProducts"]>[number]["updates"]
>;

/** Starts an explicit trial on a kept row, or ends its trial when the request removes it. */
export const applyTrialContextToPatchedCustomerProduct = ({
	customerProduct,
	trialContext,
}: {
	customerProduct: FullCusProduct;
	trialContext?: TrialContext;
}): PatchedCustomerProductUpdates => {
	if (!trialContext) return {};

	if (trialContext.customFreeTrial) {
		customerProduct.free_trial = trialContext.customFreeTrial;
		customerProduct.free_trial_id = trialContext.customFreeTrial.id;
		customerProduct.trial_ends_at = trialContext.trialEndsAt ?? null;

		return {
			free_trial_id: customerProduct.free_trial_id,
			trial_ends_at: customerProduct.trial_ends_at,
		};
	}

	if (trialContext.trialEndsAt === null) {
		customerProduct.free_trial = null;
		customerProduct.free_trial_id = null;
		customerProduct.trial_ends_at = null;

		return {
			free_trial_id: null,
			trial_ends_at: null,
		};
	}

	return {};
};
