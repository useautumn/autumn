import { stripeToAtmnAmount } from "@autumn/shared";

export const stripeUnitAmountToMajorUnits = ({
	unitAmounts,
	currency,
}: {
	unitAmounts: {
		unit_amount?: number | null;
		unit_amount_decimal?: string | null;
	};
	currency: string;
}) => {
	const amount =
		typeof unitAmounts.unit_amount === "number"
			? unitAmounts.unit_amount
			: unitAmounts.unit_amount_decimal
				? Number(unitAmounts.unit_amount_decimal)
				: null;
	return amount === null ? null : stripeToAtmnAmount({ amount, currency });
};
