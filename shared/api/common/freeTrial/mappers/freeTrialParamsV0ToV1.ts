import type { FreeTrialParamsV0 } from "@api/common/freeTrial/freeTrialParamsV0";
import type { FreeTrialParamsV1 } from "@api/common/freeTrial/freeTrialParamsV1";

export const freeTrialParamsV0ToV1 = ({
	freeTrialParamsV0,
}: {
	freeTrialParamsV0: FreeTrialParamsV0 | null | undefined;
}): FreeTrialParamsV1 | null | undefined => {
	// If it's undefined, means no action
	if (freeTrialParamsV0 === undefined) return undefined;

	// If it's null, means remove the trial
	if (freeTrialParamsV0 === null) return null;

	return {
		duration_length: freeTrialParamsV0.length,
		duration_type: freeTrialParamsV0.duration,
		card_required: freeTrialParamsV0.card_required,
	};
};
