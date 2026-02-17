import type {
	BillingContextOverride,
	BillingParamsBaseV1,
} from "@autumn/shared";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";

export const setupTransitionConfigs = ({
	params,
	contextOverride = {},
}: {
	params: BillingParamsBaseV1;
	contextOverride?: BillingContextOverride;
}): TransitionConfig[] => {
	if (contextOverride.transitionConfigs) {
		return contextOverride.transitionConfigs;
	}

	return (
		params.options?.map((option) => ({
			feature_id: option.feature_id,
			reset_after_trial_end: option.reset_after_trial_end,
		})) ?? []
	);
};
