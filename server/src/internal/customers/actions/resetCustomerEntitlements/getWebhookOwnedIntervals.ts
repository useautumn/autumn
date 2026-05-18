import {
	BillingInterval,
	CusProductStatus,
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
 * and handle the reset. Includes the reset day (derived from the price-backed
 * entitlement's next_reset_at) so callers can verify cycle alignment.
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
			const interval = cusPrice.price.config?.interval;
			if (!interval || interval === BillingInterval.OneOff) continue;

			const intervalCount = cusPrice.price.config?.interval_count ?? 1;
			const key = `${interval}:${intervalCount}`;
			if (seen.has(key)) continue;

			seen.add(key);

			const periodEndMs = findPriceBackedPeriodEnd({
				cusProduct,
				entitlementId: cusPrice.price.entitlement_id,
			});

			result.push({
				interval,
				intervalCount,
				resetDayOfMonth: periodEndMs ? getDate(periodEndMs) : null,
			});
		}
	}

	return result;
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
