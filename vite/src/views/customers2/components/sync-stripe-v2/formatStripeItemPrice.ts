import { formatAmount, stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";
import { intervalSuffix } from "@/utils/formatUtils/intervalSuffix";

const formatStripeCurrency = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}): string => {
	const majorAmount = stripeToAtmnAmount({ amount, currency });
	return formatAmount({
		currency: currency.toUpperCase(),
		amount: majorAmount,
		minFractionDigits: majorAmount % 1 === 0 ? 0 : 2,
		maxFractionDigits: 2,
	});
};

/** "/mo", "/yr", or "/3 mo" for multi-period prices; empty for one-off. */
const formatIntervalSuffix = ({ price }: { price: Stripe.Price }): string => {
	const recurring = price.recurring;
	if (!recurring) return "";
	return intervalSuffix({
		interval: recurring.interval,
		intervalCount: recurring.interval_count ?? 1,
	});
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
