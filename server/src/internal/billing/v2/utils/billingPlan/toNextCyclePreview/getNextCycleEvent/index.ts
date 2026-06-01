import {
	type BillingContext,
	type FullCusProduct,
	getCycleEnd,
} from "@autumn/shared";
import { normalizeCustomerProductTimestamps } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/normalizeCustomerProductTimestamps";
import { classifyNextCycleEvent } from "./classifyNextCycleEvent";
import { getSmallestIntervalForNextCycle } from "./smallestInterval";
import { normalizeMs } from "./timeUtils";
import type { NextCycleEvent } from "./types";
import { buildNextCycleTransitionPoints } from "./transitionCandidates";

export { getActiveCustomerProductsAt } from "./activeCustomerProducts";
export type { NextCycleEvent, SmallestInterval } from "./types";

/** Finds the next chronological event that should generate an invoice preview. */
export const getNextCycleEvent = ({
	billingContext,
	customerProducts,
	anchorMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	anchorMs: number;
}): NextCycleEvent => {
	const { billingCycleAnchorMs, currentEpochMs } = billingContext;
	const nowMs = normalizeMs(currentEpochMs);
	const normalizedCustomerProducts = customerProducts.map(
		normalizeCustomerProductTimestamps,
	);
	const smallestInterval = getSmallestIntervalForNextCycle({
		customerProducts: normalizedCustomerProducts,
		currentEpochMs,
	});

	if (!smallestInterval) {
		return { kind: "none" };
	}

	const renewalBoundaryMs = getCycleEnd({
		anchor: anchorMs,
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
		now: currentEpochMs,
		floor: anchorMs,
	});
	const transitionTimestamps = buildNextCycleTransitionPoints({
		billingContext,
		customerProducts: normalizedCustomerProducts,
		nowMs,
	});
	const shouldShowRenewal =
		billingCycleAnchorMs !== "now" || transitionTimestamps.length > 0;
	const candidateTimestamps = Array.from(
		new Set([
			...transitionTimestamps,
			...(shouldShowRenewal && renewalBoundaryMs > nowMs
				? [renewalBoundaryMs]
				: []),
		]),
	).sort((a, b) => a - b);

	for (const startsAtMs of candidateTimestamps) {
		const event = classifyNextCycleEvent({
			billingContext,
			customerProducts,
			normalizedCustomerProducts,
			startsAtMs,
			renewalBoundaryMs,
			smallestInterval,
		});

		if (event) return event;
	}

	return { kind: "none" };
};
