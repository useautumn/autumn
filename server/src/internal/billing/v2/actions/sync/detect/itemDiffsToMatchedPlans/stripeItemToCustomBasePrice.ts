import {
	BillingInterval,
	type CustomizePlanV1,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

type CustomBasePrice = NonNullable<CustomizePlanV1["price"]>;

const STRIPE_TO_AUTUMN_INTERVAL: Record<string, BillingInterval> = {
	week: BillingInterval.Week,
	month: BillingInterval.Month,
	year: BillingInterval.Year,
};

/** Read a base-price shape off a raw Stripe item; null when the item can't
 * express one (missing amount/currency, unsupported interval). */
export const stripeItemToCustomBasePrice = ({
	item,
}: {
	item: StripeItemSnapshot;
}): CustomBasePrice | null => {
	const rawAmount = item.unit_amount_decimal ?? item.unit_amount;
	if (rawAmount === null || !item.currency || !item.recurring_interval) {
		return null;
	}
	const amount = Number(rawAmount);
	if (!Number.isFinite(amount)) return null;
	const interval = STRIPE_TO_AUTUMN_INTERVAL[item.recurring_interval];
	if (!interval) return null;
	return {
		amount: stripeToAtmnAmount({ amount, currency: item.currency }),
		interval,
		interval_count: item.recurring_interval_count ?? 1,
		base_currency: item.currency,
		stripe_price_id: item.stripe_price_id,
	};
};
