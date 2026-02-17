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
}): TransitionConfig => {
	if (contextOverride.transitionConfig) {
		return contextOverride.transitionConfig;
	}

	return {
		resetAfterTrialEndFeatureIds:
			params.transition_rules?.reset_after_trial_end ?? [],
	};
};
