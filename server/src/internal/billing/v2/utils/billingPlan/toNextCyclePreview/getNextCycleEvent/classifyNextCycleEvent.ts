import {
	type BillingContext,
	type FullCusProduct,
	timestampsMatch,
} from "@autumn/shared";
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
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	normalizedCustomerProducts: FullCusProduct[];
	startsAtMs: number;
	renewalBoundaryMs: number;
	smallestInterval: SmallestInterval;
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

	if (timestampsMatch(startsAtMs, renewalBoundaryMs)) {
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
	const isProductTransition = hasProductTransitionAt({
		customerProducts: normalizedCustomerProducts,
		startsAtMs,
	});
	const isTrialEnd = hasTrialEndAt({
		billingContext,
		customerProducts: normalizedCustomerProducts,
		startsAtMs,
	});

	if (isAnchorReset && !isProductTransition && !isTrialEnd) {
		return { kind: "anchor_reset", smallestInterval };
	}

	const previousCustomerProducts = getActiveCustomerProductsAt({
		customerProducts,
		startsAtMs: exactStartsAtMs - SECOND_MS,
	});
	const incomingCustomerProducts = differenceByCustomerProductId({
		left: activeCustomerProducts,
		right: previousCustomerProducts,
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

	if (
		incomingCustomerProducts.length > 0 &&
		outgoingCustomerProducts.length > 0
	) {
		return {
			kind: "scheduled_change",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			resetsBillingCycle: isAnchorReset,
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
			customerProducts: incomingCustomerProducts,
		};
	}

	if (outgoingCustomerProducts.length > 0) {
		return {
			kind: "scheduled_change",
			smallestInterval,
			startsAtMs: exactStartsAtMs,
			resetsBillingCycle: isAnchorReset,
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
