import type { FullCusProduct } from "@autumn/shared";
import type { FreeTrialFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** The trial this plan row starts, measured on the calendar from its start; none once ended. */
export const customerProductToFreeTrialFacts = ({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs: number;
}): FreeTrialFacts | null => {
	const { free_trial: freeTrial, trial_ends_at: trialEndsAt } = customerProduct;
	const trialIsRunning = Boolean(
		freeTrial && trialEndsAt && trialEndsAt > nowMs,
	);
	if (!freeTrial || !trialIsRunning) return null;

	return {
		duration: { length: freeTrial.length, unit: freeTrial.duration },
		starts_at: customerProduct.starts_at,
		card_required: freeTrial.card_required,
		on_end: freeTrial.on_end ?? "bill",
	};
};
