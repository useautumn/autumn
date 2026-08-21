import { FreeTrialDuration, type FrontendProduct } from "@autumn/shared";

export const getDefaultFreeTrial = ({
	planType,
}: {
	planType?: FrontendProduct["planType"];
} = {}) => {
	return {
		length: 7,
		unique_fingerprint: false,
		duration: FreeTrialDuration.Day,
		card_required: planType !== "free",
	};
};
