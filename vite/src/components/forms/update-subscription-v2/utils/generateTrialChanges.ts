import type { FreeTrialDuration, FullCusProduct } from "@autumn/shared";
import { isCustomerProductTrialing } from "@autumn/shared";
import type { SummaryItem } from "../types/summary";

export function generateTrialChanges({
	customerProduct,
	removeTrial,
	trialLength,
	trialDuration,
}: {
	customerProduct: FullCusProduct;
	removeTrial: boolean;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
}): SummaryItem[] {
	const isCurrentlyTrialing = isCustomerProductTrialing(customerProduct);
	const changes: SummaryItem[] = [];

	if (removeTrial && isCurrentlyTrialing) {
		changes.push({
			id: "trial-remove",
			type: "trial",
			label: "Free Trial",
			description: "Remove active free trial",
			oldValue: "Active",
			newValue: null,
		});
	} else if (!removeTrial && trialLength !== null && trialLength > 0) {
		const durationLabel =
			trialLength === 1 ? trialDuration : `${trialDuration}s`;
		changes.push({
			id: "trial-add",
			type: "trial",
			label: "Free Trial",
			description: `Add ${trialLength} ${durationLabel} free trial`,
			oldValue: null,
			newValue: `${trialLength} ${durationLabel}`,
		});
	}

	return changes;
}
