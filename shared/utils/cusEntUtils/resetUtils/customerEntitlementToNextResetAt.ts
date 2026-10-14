import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth } from "date-fns";
import type { CusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";
import { EntInterval } from "../../../models/productModels/intervals/entitlementInterval.js";
import { getCycleEnd } from "../../billingUtils/cycleUtils/getCycleEnd.js";
import { clampNextResetAtToPendingBillingCycleAnchor } from "./clampNextResetAtToPendingBillingCycleAnchor.js";
import { getNextResetAt } from "./getNextResetAt.js";

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

export const customerEntitlementToNextResetAt = ({
	customerEntitlement,
	billingCycleAnchor,
	now,
}: {
	customerEntitlement: NextResetAtCustomerEntitlement;
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
