import {
	type BillingContext,
	type FullCusProduct,
	timestampsMatch,
} from "@autumn/shared";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import {
	phaseStartRaisesInvoice,
	resolvePhaseStartProrationBehavior,
} from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";
import { getActiveCustomerProductsAt } from "./activeCustomerProducts";
import {
	differenceByCustomerProductId,
	getImplicitOutgoingCustomerProducts,
	uniqueCustomerProductsById,
} from "./customerProductDiffs";
import { SECOND_MS, timestampsEqual } from "./timeUtils";
import {
	getExactTransitionTimestamp,
	hasProductTransitionAt,
	hasTrialEndAt,
} from "./transitionCandidates";
import type { NextCycleEvent, SmallestInterval } from "./types";

/** Classifies one candidate timestamp into the invoice event it represents. */
export const classifyNextCycleEvent = ({
	billingContext,
	customerProducts,
	normalizedCustomerProducts,
	startsAtMs,
	renewalBoundaryMs,
	smallestInterval,
	phaseProrations,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	normalizedCustomerProducts: FullCusProduct[];
	startsAtMs: number;
	renewalBoundaryMs: number;
	smallestInterval: SmallestInterval;
	phaseProrations: SchedulePhaseProration[];
}): NextCycleEvent | undefined => {
	const exactStartsAtMs = getExactTransitionTimestamp({
		billingContext,
		customerProducts,
		startsAtMs,
	});
	const activeCustomerProducts = getActiveCustomerProductsAt({
		customerProducts,
		startsAtMs: exactStartsAtMs,
	});

	const isProductTransition = hasProductTransitionAt({
		customerProducts: normalizedCustomerProducts,
		startsAtMs,
	});

	// A plan change landing on the renewal boundary is still a transition. Taking
	// the renewal branch drops the incoming plan's line items, because only that
	// branch filters them to a billing period starting at the boundary.
	if (timestampsMatch(startsAtMs, renewalBoundaryMs) && !isProductTransition) {
		const activeCustomerProducts = getActiveCustomerProductsAt({
			customerProducts,
			startsAtMs: renewalBoundaryMs,
		});

		return {
			kind: "renewal",
			smallestInterval,
			startsAtMs: renewalBoundaryMs,
			customerProducts: activeCustomerProducts,
		};
	}

	const isAnchorReset =
		timestampsEqual(billingContext.requestedBillingCycleAnchor, startsAtMs) ||
		normalizedCustomerProducts.some((customerProduct) =>
			timestampsEqual(
				customerProduct.billing_cycle_anchor_resets_at ?? undefined,
				startsAtMs,
			),
		);
	const isTrialEnd = hasTrialEndAt({
		billingContext,
		customerProducts: normalizedCustomerProducts,
		startsAtMs,
	});

	if (isAnchorReset && !isProductTransition && !isTrialEnd) {
		return {
			kind: "anchor_reset",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			prorationBehavior: resolvePhaseStartProrationBehavior({
				phaseProrations,
				phaseStartMs: exactStartsAtMs,
				resetsBillingCycle: true,
				changesCustomerProducts: false,
			}),
		};
	}

	const previousCustomerProducts = getActiveCustomerProductsAt({
		customerProducts,
		startsAtMs: exactStartsAtMs - SECOND_MS,
	});
	const incomingCustomerProducts = differenceByCustomerProductId({
		left: activeCustomerProducts,
		right: previousCustomerProducts,
	});
	const prorationBehavior = resolvePhaseStartProrationBehavior({
		phaseProrations,
		phaseStartMs: exactStartsAtMs,
		resetsBillingCycle: isAnchorReset,
		changesCustomerProducts: true,
	});
	const outgoingCustomerProducts = uniqueCustomerProductsById([
		...differenceByCustomerProductId({
			left: previousCustomerProducts,
			right: activeCustomerProducts,
		}),
		...getImplicitOutgoingCustomerProducts({
			incomingCustomerProducts,
			previousCustomerProducts,
		}),
	]);

	const changesCustomerProducts =
		incomingCustomerProducts.length > 0 || outgoingCustomerProducts.length > 0;
	const landsOnRenewal = timestampsMatch(startsAtMs, renewalBoundaryMs);
	const startsWithoutPaidPlans = previousCustomerProducts.length === 0;
	const raisesInvoice = phaseStartRaisesInvoice({
		prorationBehavior,
		startsNewBillingCycle:
			isAnchorReset || landsOnRenewal || startsWithoutPaidPlans,
	});
	if (changesCustomerProducts && !raisesInvoice && !isTrialEnd) return;

	if (
		incomingCustomerProducts.length > 0 &&
		outgoingCustomerProducts.length > 0
	) {
		return {
			kind: "scheduled_change",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			renewalBoundaryMs,
			resetsBillingCycle: isAnchorReset,
			prorationBehavior,
			incomingCustomerProducts,
			outgoingCustomerProducts,
		};
	}

	if (incomingCustomerProducts.length > 0) {
		return {
			kind: "scheduled_start",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			resetsBillingCycle: isAnchorReset,
			prorationBehavior,
			customerProducts: incomingCustomerProducts,
		};
	}

	if (outgoingCustomerProducts.length > 0) {
		return {
			kind: "scheduled_change",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			renewalBoundaryMs,
			resetsBillingCycle: isAnchorReset,
			prorationBehavior,
			incomingCustomerProducts,
			outgoingCustomerProducts,
		};
	}

	if (isTrialEnd) {
		return {
			kind: "trial_end",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			customerProducts: activeCustomerProducts,
		};
	}
};
