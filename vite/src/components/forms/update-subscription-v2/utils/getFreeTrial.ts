import type { CreateFreeTrial, FreeTrialDuration } from "@autumn/shared";

/**
 * Determines the free trial configuration to be used based on the provided options.
 */
export function getFreeTrial({
	removeTrial,
	trialLength,
	trialDuration,
}: {
	removeTrial: boolean;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
}): CreateFreeTrial | null | undefined {
	if (removeTrial) return null;
	if (trialLength !== null && trialLength > 0) {
		return {
			length: trialLength,
			duration: trialDuration,
			card_required: true,
			unique_fingerprint: false,
		};
	}
	return undefined;
}
