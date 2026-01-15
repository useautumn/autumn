import {
	type FreeTrialDuration,
	type FullCusProduct,
	getRemainingTrialDays,
	getTrialLengthInDays,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { addDays, formatDuration, intervalToDuration } from "date-fns";
import type { SummaryItem } from "../types/summary";

function formatDaysAsReadable(totalDays: number): string {
	if (totalDays <= 0) return "0 days";

	const now = new Date();
	const futureDate = addDays(now, totalDays);
	const duration = intervalToDuration({ start: now, end: futureDate });

	return formatDuration(duration, {
		format: ["years", "months", "weeks", "days"],
		delimiter: ", ",
	});
}

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
	const remainingDays = getRemainingTrialDays({
		trialEndsAt: customerProduct.trial_ends_at,
	});
	const changes: SummaryItem[] = [];

	if (removeTrial && isCurrentlyTrialing) {
		changes.push({
			id: "trial-remove",
			type: "trial",
			label: "End Trial",
			oldValue: "Active",
			newValue: null,
		});
		return changes;
	}

	if (!removeTrial && trialLength !== null && trialLength > 0) {
		const newTrialDays = getTrialLengthInDays({ trialLength, trialDuration });

		if (isCurrentlyTrialing && remainingDays !== null) {
			// Skip if no actual change (same number of days)
			if (newTrialDays === remainingDays) return changes;

			const isExtending = newTrialDays > remainingDays;
			changes.push({
				id: isExtending ? "trial-extend" : "trial-shorten",
				type: "trial",
				label: isExtending ? "Extend Trial" : "Shorten Trial",
				oldValue: formatDaysAsReadable(remainingDays),
				newValue: formatDaysAsReadable(newTrialDays),
			});
		} else {
			// Not currently trialing - adding new trial
			changes.push({
				id: "trial-add",
				type: "trial",
				label: "Free Trial",
				oldValue: null,
				newValue: formatDaysAsReadable(newTrialDays),
			});
		}
	}

	return changes;
}
