import { stripeToAtmnAmount } from "@autumn/shared";

export const stripeAmountToMajorUnits = ({
	amount,
	currency,
}: {
	amount: number | null | undefined;
	currency: string;
}) =>
	amount === null || amount === undefined
		? null
		: stripeToAtmnAmount({ amount, currency });
