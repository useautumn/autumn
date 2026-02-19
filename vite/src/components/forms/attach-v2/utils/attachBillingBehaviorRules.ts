import type { BillingBehavior } from "@autumn/shared";

const NO_CHARGES_NEW_CYCLE_DISABLED_REASON =
	"No Charges is unavailable when Create New Cycle is selected.";
const NO_CHARGES_FREE_TO_PAID_DISABLED_REASON =
	"No Charges is unavailable when moving from a free plan to a paid recurring plan.";

export function isNoChargesAllowedForAttach({
	newBillingSubscription,
	blocksNextCycleOnly = false,
}: {
	newBillingSubscription: boolean;
	blocksNextCycleOnly?: boolean;
}) {
	return !newBillingSubscription && !blocksNextCycleOnly;
}

export function normalizeAttachBillingBehavior({
	billingBehavior,
	newBillingSubscription,
	blocksNextCycleOnly = false,
}: {
	billingBehavior: BillingBehavior | null;
	newBillingSubscription: boolean;
	blocksNextCycleOnly?: boolean;
}) {
	if (billingBehavior !== "none") {
		return billingBehavior;
	}

	if (
		isNoChargesAllowedForAttach({ newBillingSubscription, blocksNextCycleOnly })
	) {
		return billingBehavior;
	}

	return null;
}

export function getNoChargesDisabledReason({
	newBillingSubscription,
	blocksNextCycleOnly = false,
}: {
	newBillingSubscription: boolean;
	blocksNextCycleOnly?: boolean;
}) {
	if (newBillingSubscription) {
		return NO_CHARGES_NEW_CYCLE_DISABLED_REASON;
	}

	if (blocksNextCycleOnly) {
		return NO_CHARGES_FREE_TO_PAID_DISABLED_REASON;
	}

	return undefined;
}
