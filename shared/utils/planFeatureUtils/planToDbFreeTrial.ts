import type { ApiFreeTrialV2 } from "../../api/models";
import type { CreateFreeTrial } from "../../models/productModels/freeTrialModels/freeTrialModels";

export const planToDbFreeTrial = ({
	planFreeTrial,
}: {
	planFreeTrial: ApiFreeTrialV2 | null;
}): CreateFreeTrial | null => {
	if (!planFreeTrial) return null;

	return {
		duration: planFreeTrial.duration_type,
		length: planFreeTrial.duration_length,
		unique_fingerprint: false,
		card_required: planFreeTrial.card_required,
	};
};
