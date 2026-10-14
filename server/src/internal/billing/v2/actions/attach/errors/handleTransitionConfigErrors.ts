import type { AttachBillingContext } from "@autumn/shared";
import { featureUtils, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const handleTransitionConfigErrors = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
}) => {
	const { transitionConfig } = billingContext;

	const resetAfterTrialEndFeatureIds =
		transitionConfig?.resetAfterTrialEndFeatureIds ?? [];

	for (const featureId of resetAfterTrialEndFeatureIds) {
		const feature = featureUtils.find.byId({
			features: ctx.features,
			featureId,
			errorOnNotFound: true,
		});

		if (featureUtils.isAllocated(feature)) {
			throw new RecaseError({
				message: `reset_after_trial_end is not supported for allocated features. Feature '${featureId}' is an allocated feature (continuous_use) and does not have a reset cycle.`,
			});
		}
	}
};
