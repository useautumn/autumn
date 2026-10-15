import { atmnToStripeAmount, stripeToAtmnAmount } from "@autumn/shared";

export const roundToMinorUnits = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	stripeToAtmnAmount({
		amount: atmnToStripeAmount({ amount, currency }),
		currency,
	});
