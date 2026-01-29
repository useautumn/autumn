import {
	addDuration,
	FreeTrialDuration,
	type FullProduct,
	InternalError,
} from "@autumn/shared";
import type { TrialContext } from "@autumn/shared";

export const setupCreateCustomerTrialContext = ({
	paidProducts,
	currentEpochMs,
}: {
	paidProducts: FullProduct[];
	currentEpochMs: number;
}): TrialContext | undefined => {
	if (!paidProducts?.length) return undefined;

	const trial = paidProducts.find((p) => p.is_default && Boolean(p.free_trial));

	if (!trial) {
		throw new InternalError({
			message:
				"[setupCreateCustomerTrialContext] No trial product found for paid defaults",
		});
	}

	return {
		freeTrial: trial.free_trial,
		trialEndsAt: addDuration({
			now: currentEpochMs,
			durationType: trial.free_trial?.duration ?? FreeTrialDuration.Day,
			durationLength: trial.free_trial?.length,
		}),
		appliesToBilling: true,
		cardRequired: false,
	};
};
