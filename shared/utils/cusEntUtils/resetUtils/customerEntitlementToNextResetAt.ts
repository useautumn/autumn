import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth } from "date-fns";
import type { CusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";
import { EntInterval } from "../../../models/productModels/intervals/entitlementInterval.js";
import { getCycleEnd } from "../../billingUtils/cycleUtils/getCycleEnd.js";
import { clampNextResetAtToPendingBillingCycleAnchor } from "./clampNextResetAtToPendingBillingCycleAnchor.js";
import { getNextResetAt } from "./getNextResetAt.js";

/** What deciding the next reset reads: the cycle that ended, its interval, and the plan's pending anchor reset. */
export type NextResetAtCustomerEntitlement = {
	next_reset_at: number;
	entitlement: Pick<Entitlement, "interval_count"> & {
		interval: EntInterval;
	};
	customer_product: Pick<CusProduct, "billing_cycle_anchor_resets_at"> | null;
};

const SHORT_INTERVALS: readonly EntInterval[] = [
	EntInterval.Minute,
	EntInterval.Hour,
	EntInterval.Day,
];

/** The 30th, or 28 Feb: the dates where stepping by months drifts from the subscription's anchor day. */
const isAnchorEdgeDate = ({ resetAt }: { resetAt: number }): boolean => {
	const date = new UTCDate(resetAt);
	return getDate(date) === 30 || (getDate(date) === 28 && getMonth(date) === 1);
};

const steppedNextResetAt = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: NextResetAtCustomerEntitlement;
	now: number;
}): number =>
	getNextResetAt({
		curReset: customerEntitlement.next_reset_at,
		interval: customerEntitlement.entitlement.interval,
		intervalCount: customerEntitlement.entitlement.interval_count ?? 1,
		now,
	});

/** Whether the subscription's billing anchor can move this reset: a plan's row on a long interval landing on an edge date. */
export const resetNeedsBillingCycleAnchor = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: NextResetAtCustomerEntitlement;
	now: number;
}): boolean => {
	if (!customerEntitlement.customer_product) return false;
	if (SHORT_INTERVALS.includes(customerEntitlement.entitlement.interval))
		return false;
	return isAnchorEdgeDate({
		resetAt: steppedNextResetAt({ customerEntitlement, now }),
	});
};

/**
 * The reset after the one that ended: stepped by interval past `now`, aligned to the subscription's
 * anchor when one is given and it matters, then capped by a pending anchor reset on the plan.
 */
export const customerEntitlementToNextResetAt = ({
	customerEntitlement,
	billingCycleAnchor,
	now,
}: {
	customerEntitlement: NextResetAtCustomerEntitlement;
	/** The subscription's billing cycle anchor in ms; pass it only when `resetNeedsBillingCycleAnchor`. */
	billingCycleAnchor?: number;
	now: number;
}): number => {
	const cycleEndedAt = customerEntitlement.next_reset_at;
	const { interval, interval_count: intervalCount } =
		customerEntitlement.entitlement;
	const stepped = steppedNextResetAt({ customerEntitlement, now });

	const customerProduct = customerEntitlement.customer_product;
	if (!customerProduct) return stepped;

	const aligned =
		billingCycleAnchor !== undefined &&
		resetNeedsBillingCycleAnchor({ customerEntitlement, now })
			? Math.max(
					stepped,
					getCycleEnd({
						anchor: billingCycleAnchor,
						interval,
						intervalCount: intervalCount ?? 1,
						now: cycleEndedAt,
					}),
				)
			: stepped;

	return clampNextResetAtToPendingBillingCycleAnchor({
		billingCycleAnchorResetsAt: customerProduct.billing_cycle_anchor_resets_at,
		currentEpochMs: cycleEndedAt,
		nextResetAt: aligned,
	});
};
