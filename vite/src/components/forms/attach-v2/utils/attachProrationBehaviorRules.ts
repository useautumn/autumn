import type { BillingBehavior } from "@autumn/shared";

const NO_CHARGES_NEW_CYCLE_DISABLED_REASON =
	"No Charges is unavailable when Create New Cycle is selected.";
const NO_CHARGES_FREE_TO_PAID_DISABLED_REASON =
	"No Charges is unavailable when moving from a free plan to a paid recurring plan.";

export function isNoChargesAllowedForAttach({
	newBillingSubscription,
	disableProration = false,
}: {
	newBillingSubscription: boolean;
	disableProration?: boolean;
}) {
	return !newBillingSubscription && !disableProration;
}

export function normalizeAttachProrationBehavior({
	prorationBehavior,
	newBillingSubscription,
	disableProration = false,
}: {
	prorationBehavior: BillingBehavior | null;
	newBillingSubscription: boolean;
	disableProration?: boolean;
}) {
	if (prorationBehavior !== "none") {
		return prorationBehavior;
	}

	if (
		isNoChargesAllowedForAttach({ newBillingSubscription, disableProration })
	) {
		return prorationBehavior;
	}

	return null;
}

export function getNoChargesDisabledReason({
	newBillingSubscription,
	disableProration = false,
}: {
	newBillingSubscription: boolean;
	disableProration?: boolean;
}) {
	if (newBillingSubscription) {
		return NO_CHARGES_NEW_CYCLE_DISABLED_REASON;
	}

	if (disableProration) {
		return NO_CHARGES_FREE_TO_PAID_DISABLED_REASON;
	}

	return undefined;
}
