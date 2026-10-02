import {
	numberWithCommas,
	type ProcessorItem,
	type ProcessorItemPrice,
} from "@autumn/shared";
import { intervalSuffix } from "@/utils/formatUtils/intervalSuffix";
import type { ReviewChangeValue } from "./types/reviewChange";

const ONE_OFF_SUFFIX = "one-off";

/** "/mo", "/3 mo", or "one-off" for a price without a recurring interval. */
export const priceIntervalSuffix = (price: ProcessorItemPrice) => {
	if (!price.interval) return ONE_OFF_SUFFIX;
	return intervalSuffix({
		interval: price.interval,
		intervalCount: price.interval_count,
	});
};

const NO_QUANTITY = "—";
const ONE_TIME_LABEL = "one-time";
const STRIPE_LOCALE = "en-GB";
const MAX_UNIT_PRICE_DIGITS = 10;
const TIER_LABELS: Record<
	NonNullable<ProcessorItemPrice["tiers_mode"]>,
	string
> = { graduated: "Graduated tiers", volume: "Volume tiers" };

const currencyFractionDigits = (currency: string) =>
	new Intl.NumberFormat(STRIPE_LOCALE, {
		style: "currency",
		currency,
	}).resolvedOptions().maximumFractionDigits ?? 0;

/** Stripe's amount format: a disambiguated currency prefix such as "US$37,500.00". */
const stripeMoney = ({
	amount,
	currency,
	maxFractionDigits = 0,
}: {
	amount: number;
	currency: string;
	maxFractionDigits?: number;
}) => {
	const fractionDigits = currencyFractionDigits(currency);
	return new Intl.NumberFormat(STRIPE_LOCALE, {
		style: "currency",
		currency,
		currencyDisplay: "symbol",
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: Math.max(fractionDigits, maxFractionDigits),
	}).format(amount);
};

/** "year", "3 months", or undefined for a one-time price. */
const billingPeriod = (price: ProcessorItemPrice) => {
	if (!price.interval) return undefined;
	return price.interval_count > 1
		? `${price.interval_count} ${price.interval}s`
		: price.interval;
};

const unitsPerQuantity = (price: ProcessorItemPrice) =>
	price.units_per_quantity ?? 1;

/** "per unit" or "per 100 units" for usage-billed prices. */
const perUnitLabel = (price: ProcessorItemPrice) =>
	unitsPerQuantity(price) > 1
		? `per ${numberWithCommas(unitsPerQuantity(price))} units`
		: "per unit";

const isBilledPerUnit = (price: ProcessorItemPrice) =>
	price.usage_type === "metered" || unitsPerQuantity(price) > 1;

/** "US$37,500.00 / year", or "US$37,500.00 one-time" without an interval. */
const withBillingPeriod = ({
	label,
	price,
}: {
	label: string;
	price: ProcessorItemPrice;
}) => {
	const period = billingPeriod(price);
	return period ? `${label} / ${period}` : `${label} ${ONE_TIME_LABEL}`;
};

const chargeLabel = (price: ProcessorItemPrice) => {
	if (price.tiers_mode) return TIER_LABELS[price.tiers_mode];
	if (price.unit_amount === null) return undefined;
	const unitAmount = stripeMoney({
		amount: price.unit_amount,
		currency: price.currency,
		maxFractionDigits: MAX_UNIT_PRICE_DIGITS,
	});
	return isBilledPerUnit(price)
		? `${unitAmount} ${perUnitLabel(price)}`
		: unitAmount;
};

/** The price line under a product, as Stripe writes it: "US$37,500.00 / year" or "US$0.01 per unit / month". */
export const pricingTableUnitPrice = (price: ProcessorItemPrice) => {
	const label = chargeLabel(price);
	return label ? withBillingPeriod({ label, price }) : undefined;
};

export const pricingTableQuantity = (item: ProcessorItem) =>
	item.quantity === null || item.price?.usage_type === "metered"
		? NO_QUANTITY
		: numberWithCommas(item.quantity);

/** The Total column: "US$37,500.00 / year", or how it varies when usage decides it. */
export const pricingTableTotal = (
	item: ProcessorItem,
): ReviewChangeValue | undefined => {
	const { price } = item;
	if (!price) return undefined;
	if (item.amount !== null) {
		return {
			amount: withBillingPeriod({
				label: stripeMoney({ amount: item.amount, currency: price.currency }),
				price,
			}),
		};
	}
	if (price.usage_type === "metered")
		return { amount: "Varies with usage", isBasis: true };
	if (price.tiers_mode) return { amount: "Varies by tier", isBasis: true };
	return undefined;
};
