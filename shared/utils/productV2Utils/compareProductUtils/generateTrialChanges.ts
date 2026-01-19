import { addDays, formatDuration, intervalToDuration } from "date-fns";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import type { FreeTrialDuration } from "../../../models/productModels/freeTrialModels/freeTrialEnums.js";
import { isCustomerProductTrialing } from "../../cusProductUtils/classifyCustomerProduct/classifyCustomerProduct.js";
import {
	getRemainingTrialDays,
	getTrialLengthInDays,
} from "../../productUtils/freeTrialUtils.js";
import type { ItemEdit } from "./itemEditTypes.js";

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

/** Generates edit items for trial period changes */
export function generateTrialChanges({
	customerProduct,
	removeTrial,
	trialLength,
	trialDuration,
	trialEnabled = true,
}: {
	customerProduct: FullCusProduct;
	removeTrial: boolean;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled?: boolean;
}): ItemEdit[] {
	const isCurrentlyTrialing = isCustomerProductTrialing(customerProduct);
	const remainingDays = getRemainingTrialDays({
		trialEndsAt: customerProduct.trial_ends_at,
	});
	const changes: ItemEdit[] = [];

	if (removeTrial && isCurrentlyTrialing) {
		changes.push({
			id: "trial-remove",
			type: "trial",
			label: "End Trial",
			icon: "trial",
			description: "Trial ended",
			oldValue: "Active",
			newValue: null,
			isUpgrade: false,
		});
		return changes;
	}

	// If trial is not enabled (collapsed), don't generate changes for new trials
	if (!trialEnabled && !isCurrentlyTrialing) {
		return changes;
	}

	if (!removeTrial && trialLength !== null && trialLength > 0) {
		const newTrialDays = getTrialLengthInDays({ trialLength, trialDuration });

		if (isCurrentlyTrialing && remainingDays !== null) {
			if (newTrialDays === remainingDays) return changes;

			const isExtending = newTrialDays > remainingDays;
			const oldFormatted = formatDaysAsReadable(remainingDays);
			const newFormatted = formatDaysAsReadable(newTrialDays);

			changes.push({
				id: isExtending ? "trial-extend" : "trial-shorten",
				type: "trial",
				label: isExtending ? "Extend Trial" : "Shorten Trial",
				icon: "trial",
				description: isExtending
					? `Trial extended from ${oldFormatted} to ${newFormatted}`
					: `Trial shortened from ${oldFormatted} to ${newFormatted}`,
				oldValue: oldFormatted,
				newValue: newFormatted,
				isUpgrade: isExtending,
			});
		} else {
			const newFormatted = formatDaysAsReadable(newTrialDays);
			changes.push({
				id: "trial-add",
				type: "trial",
				label: "Free Trial",
				icon: "trial",
				description: `Free trial added for ${newFormatted}`,
				oldValue: null,
				newValue: newFormatted,
				isUpgrade: true,
			});
		}
	}

	return changes;
}
