import { FreeTrialDuration } from "@autumn/shared";

export const getDefaultFreeTrial = () => {
	return {
		length: 7,
		unique_fingerprint: false,
		duration: FreeTrialDuration.Day,
		card_required: true,
	};
};
