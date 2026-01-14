import type { CreateFreeTrial, FreeTrialDuration } from "@autumn/shared";

/**
 * Determines the free trial configuration to be used based on the provided options.
 *
 * @param {Object} params - Options for configuring the free trial.
 * @param {boolean} params.removeTrial - Whether to remove an existing trial.
 * @param {number | null} params.trialLength - The length of the trial, or null if not applicable.
 * @param {FreeTrialDuration} params.trialDuration - The duration unit (e.g., day, week, month) for the trial.
 * @param {boolean} params.trialCardRequired - Whether a card is required for the trial.
 * @returns {CreateFreeTrial | null | undefined} The trial settings to apply, `null` if the trial is to be removed, or `undefined` if no changes are needed.
 */
export function getFreeTrial({
	removeTrial,
	trialLength,
	trialDuration,
	trialCardRequired,
}: {
	removeTrial: boolean;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialCardRequired: boolean;
}): CreateFreeTrial | null | undefined {
	if (removeTrial) return null;
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
