import {
	BillingInterval,
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { getDate } from "date-fns";

export interface WebhookOwnedInterval {
	interval: string;
	intervalCount: number;
	resetDayOfMonth: number | null;
}

/**
 * Computes the set of intervals that are "webhook-owned" for a customer —
 * i.e. intervals for which a Stripe subscription will trigger invoice.created
 * and handle the reset. Intervals are normalized to EntInterval values
 * (month×3 → quarter, month×6 → semi_annual) so they match entitlement rows.
 */
export const getWebhookOwnedIntervals = ({
	fullCus,
	customerProducts,
}: {
	fullCus?: FullCustomer;
	customerProducts?: FullCusProduct[];
}): WebhookOwnedInterval[] => {
	const products = customerProducts ?? fullCus?.customer_products ?? [];
	const seen = new Set<string>();
	const result: WebhookOwnedInterval[] = [];

	for (const cusProduct of products) {
		if (cusProduct.status !== CusProductStatus.Active) continue;
		if (!cusProduct.subscription_ids?.length) continue;

		for (const cusPrice of cusProduct.customer_prices) {
			const rawInterval = cusPrice.price.config?.interval;
			if (!rawInterval || rawInterval === BillingInterval.OneOff) continue;

			const rawCount = cusPrice.price.config?.interval_count ?? 1;
			const normalized = normalizeBillingInterval(rawInterval, rawCount);
			if (!normalized) continue;

			const key = `${normalized.interval}:${normalized.intervalCount}`;
			if (seen.has(key)) continue;

			seen.add(key);

			const periodEndMs = findPriceBackedPeriodEnd({
				cusProduct,
				entitlementId: cusPrice.price.entitlement_id,
			});

			result.push({
				...normalized,
				resetDayOfMonth: periodEndMs ? getDate(periodEndMs) : null,
			});
		}
	}

	return result;
};

/**
 * Maps BillingInterval + count to the EntInterval representation used on
 * entitlement rows. Must stay in sync with stripeSubscriptionToEntInterval.
 */
const normalizeBillingInterval = (
	interval: string,
	intervalCount: number,
): { interval: string; intervalCount: number } | null => {
	switch (interval) {
		case BillingInterval.Week:
			return { interval: EntInterval.Week, intervalCount };
		case BillingInterval.Month:
			if (intervalCount === 3)
				return { interval: EntInterval.Quarter, intervalCount: 1 };
			if (intervalCount === 6)
				return { interval: EntInterval.SemiAnnual, intervalCount: 1 };
			return { interval: EntInterval.Month, intervalCount };
		case BillingInterval.Quarter:
			return { interval: EntInterval.Quarter, intervalCount };
		case BillingInterval.SemiAnnual:
			return { interval: EntInterval.SemiAnnual, intervalCount };
		case BillingInterval.Year:
			return { interval: EntInterval.Year, intervalCount };
		default:
			return null;
	}
};

const findPriceBackedPeriodEnd = ({
	cusProduct,
	entitlementId,
}: {
	cusProduct: FullCusProduct;
	entitlementId: string | null | undefined;
}): number | null => {
	if (!entitlementId) return null;

	const cusEnt = cusProduct.customer_entitlements.find(
		(ce) => ce.entitlement_id === entitlementId,
	);

	return cusEnt?.next_reset_at ?? null;
};

/**
 * Returns true if the free entitlement resets on the same day-of-month as
 * the subscription. When resetDayOfMonth is null (no reference yet), assume
 * alignment so the webhook can adopt it on first fire.
 */
export const isAlignedWithWebhookCycle = ({
	cusEntNextResetAt,
	resetDayOfMonth,
}: {
	cusEntNextResetAt: number;
	resetDayOfMonth: number | null;
}): boolean => {
	if (resetDayOfMonth === null) return true;
	return getDate(cusEntNextResetAt) === resetDayOfMonth;
};
