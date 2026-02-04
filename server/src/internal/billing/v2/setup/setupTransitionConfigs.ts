import type { BillingParamsBase } from "@autumn/shared";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";

export const setupTransitionConfigs = ({
	params,
}: {
	params: BillingParamsBase;
}): TransitionConfig[] => {
	return (
		params.options?.map((option) => ({
			feature_id: option.feature_id,
			reset_after_trial_end: option.reset_after_trial_end,
		})) ?? []
	);
};
