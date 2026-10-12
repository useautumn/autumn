import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import {
	atmnToStripeAmount,
	stripeToAtmnAmount,
} from "@utils/productUtils/priceUtils/convertAmountUtils";

/**
 * Rounds each band to what the currency can bill. Per-band rounding can drift
 * from the rounded total, so the last band absorbs the difference and the lines sum exactly.
 */
export const tierLineBandsToBilledAmounts = ({
	bands,
	total,
	currency,
}: {
	bands: TierLineBand[];
	total: number;
	currency: string;
}): number[] => {
	const bandMinorAmounts = bands.map((band) =>
		atmnToStripeAmount({ amount: band.amount, currency }),
	);
	const roundedBandsMinor = bandMinorAmounts.reduce(
		(sum, amount) => sum + amount,
		0,
	);
	const driftMinor =
		atmnToStripeAmount({ amount: total, currency }) - roundedBandsMinor;

	const lastIndex = bandMinorAmounts.length - 1;
	return bandMinorAmounts.map((amountMinor, index) =>
		stripeToAtmnAmount({
			amount: index === lastIndex ? amountMinor + driftMinor : amountMinor,
			currency,
		}),
	);
};
