import { Decimal } from "decimal.js";
import type Stripe from "stripe";

const tierAmount = (
	amount?: number | null,
	amountDecimal?: string | null,
): Decimal => new Decimal(amountDecimal ?? amount ?? 0);

const volumeTiersToAmount = ({
	tiers,
	quantity,
}: {
	tiers: Stripe.Price.Tier[];
	quantity: number;
}): Decimal => {
	const tier =
		tiers.find(
			(candidate) => candidate.up_to == null || quantity <= candidate.up_to,
		) ?? tiers[tiers.length - 1];
	return tierAmount(tier.flat_amount, tier.flat_amount_decimal).plus(
		tierAmount(tier.unit_amount, tier.unit_amount_decimal).mul(quantity),
	);
};

const graduatedTiersToAmount = ({
	tiers,
	quantity,
}: {
	tiers: Stripe.Price.Tier[];
	quantity: number;
}): Decimal => {
	let total = new Decimal(0);
	let bandStart = 0;
	for (const tier of tiers) {
		if (quantity <= bandStart) break;
		const bandEnd = tier.up_to ?? Number.POSITIVE_INFINITY;
		const units = Math.min(quantity, bandEnd) - bandStart;
		total = total
			.plus(tierAmount(tier.flat_amount, tier.flat_amount_decimal))
			.plus(tierAmount(tier.unit_amount, tier.unit_amount_decimal).mul(units));
		bandStart = bandEnd;
	}
	return total;
};

export const stripePriceToAmount = ({
	stripePrice,
	quantity,
}: {
	stripePrice: Stripe.Price;
	quantity: number;
}): number | null => {
	if (stripePrice.billing_scheme === "tiered") {
		const tiers = stripePrice.tiers;
		if (!tiers?.length) return null;
		const total =
			stripePrice.tiers_mode === "volume"
				? volumeTiersToAmount({ tiers, quantity })
				: graduatedTiersToAmount({ tiers, quantity });
		return total.toNumber();
	}

	return tierAmount(stripePrice.unit_amount, stripePrice.unit_amount_decimal)
		.mul(quantity)
		.toNumber();
};
