import {
	cusEntToCusPrice,
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import {
	isAlignedWithWebhookCycle,
	type WebhookOwnedInterval,
} from "../resetCustomerEntitlements/getWebhookOwnedIntervals.js";

/**
 * Filters customer entitlements to those needing reset:
 *   - `next_reset_at` is set and overdue (`< now`)
 *   - not price-backed (metered paid entitlements are billed, not reset)
 *   - not webhook-owned (free ents whose interval matches an active subscription)
 *   - past-due cusEnts are skipped unless the owning product opts in via
 *     `product.config.ignore_past_due === true`
 *
 * Callers must fetch `[Active, PastDue]` cusEnts upstream for the past-due
 * gate to apply; narrower fetches are still correct (past-due cusEnts simply
 * never enter the candidate set).
 */
export const getResettableCustomerEntitlements = ({
	customerEntitlements,
	now,
	webhookOwnedIntervals = [],
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
	webhookOwnedIntervals?: WebhookOwnedInterval[];
}): FullCusEntWithFullCusProduct[] => {
	const result: FullCusEntWithFullCusProduct[] = [];

	for (const cusEnt of customerEntitlements) {
		if (!cusEnt.next_reset_at || cusEnt.next_reset_at >= now) continue;

		const cusProduct = cusEnt.customer_product;
		if (cusProduct?.status === CusProductStatus.PastDue) {
			if (!cusProduct.product?.config?.ignore_past_due) continue;
		}

		if (cusEntToCusPrice({ cusEnt })) continue;

		if (isWebhookOwned({ cusEnt, webhookOwnedIntervals })) continue;

		result.push(cusEnt);
	}

	return result;
};

const isWebhookOwned = ({
	cusEnt,
	webhookOwnedIntervals,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	webhookOwnedIntervals: WebhookOwnedInterval[];
}): boolean => {
	if (webhookOwnedIntervals.length === 0) return false;
	if (!cusEnt.customer_product) return false;

	const entInterval = cusEnt.entitlement.interval;
	const entIntervalCount = cusEnt.entitlement.interval_count ?? 1;
	if (!entInterval || !cusEnt.next_reset_at) return false;

	return webhookOwnedIntervals.some(
		(owned) =>
			owned.interval === entInterval &&
			owned.intervalCount === entIntervalCount &&
			isAlignedWithWebhookCycle({
				cusEntNextResetAt: cusEnt.next_reset_at!,
				resetDayOfMonth: owned.resetDayOfMonth,
			}),
	);
};
