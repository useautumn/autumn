import {
	atmnToStripeAmount,
	stripeToAtmnAmount,
	sumValues,
} from "@autumn/shared";

// Stripe charges each line in whole minor units, so round per line before summing.
export const sumPreviewLineAmounts = ({
	amounts,
	currency,
}: {
	amounts: number[];
	currency: string;
}): number =>
	stripeToAtmnAmount({
		amount: sumValues(
			amounts.map((amount) => atmnToStripeAmount({ amount, currency })),
		),
		currency,
	});
