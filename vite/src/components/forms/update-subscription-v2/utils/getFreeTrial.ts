import type { CreateFreeTrial, FreeTrialDuration } from "@autumn/shared";

/**
 * Determines the free trial configuration to be used based on the provided options.
 */
export function getFreeTrial({
	removeTrial,
	trialLength,
	trialDuration,
	trialEnabled,
	trialCardRequired = true,
}: {
	removeTrial: boolean;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled: boolean;
	trialCardRequired?: boolean;
}): CreateFreeTrial | null | undefined {
	if (removeTrial) return null;
	if (!trialEnabled) return undefined;
	if (trialLength !== null && trialLength > 0) {
		return {
			length: trialLength,
			duration: trialDuration,
			card_required: trialCardRequired,
			unique_fingerprint: false,
		};
	}
	return undefined;
}
