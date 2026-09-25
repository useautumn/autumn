import type Stripe from "stripe";

const INTERVAL_SUFFIXES: Record<Stripe.Price.Recurring.Interval, string> = {
	day: "day",
	week: "wk",
	month: "mo",
	year: "yr",
};

const formatStripeCurrency = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}): string => {
	const major = amount / 100;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
			minimumFractionDigits: major % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2,
		}).format(major);
	} catch {
		return `${major.toFixed(2)} ${currency.toUpperCase()}`;
	}
};

/** "/mo", "/yr", or "/3 mo" for multi-period prices; empty for one-off. */
const formatIntervalSuffix = ({ price }: { price: Stripe.Price }): string => {
	const recurring = price.recurring;
	if (!recurring) return "";
	const unit = INTERVAL_SUFFIXES[recurring.interval] ?? recurring.interval;
	const count = recurring.interval_count ?? 1;
	return count > 1 ? `/${count} ${unit}` : `/${unit}`;
};

/** A Stripe item's price as billed: "$30,000/yr", "$0.01/unit/mo (metered)". */
export const formatStripeItemPrice = ({
	price,
}: {
	price: Stripe.Price | null | undefined;
}): string => {
	if (!price) return "—";
	const interval = formatIntervalSuffix({ price });

	if (price.billing_scheme === "tiered") {
		return `${price.tiers_mode === "volume" ? "Volume" : "Tiered"}${interval}`;
	}

	const currency = price.currency ?? "usd";
	const amount =
		price.unit_amount != null
			? formatStripeCurrency({ amount: price.unit_amount, currency })
			: null;

	if (price.recurring?.usage_type === "metered") {
		return amount ? `${amount}/unit${interval} (metered)` : "Metered usage";
	}
	return amount ? `${amount}${interval}` : "—";
};
