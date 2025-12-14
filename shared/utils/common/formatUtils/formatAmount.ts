import type { Organization } from "../../../models/orgModels/orgTable";

export const formatAmount = ({
	org,
	currency,
	amount,
	maxFractionDigits = 10,
	minFractionDigits = 0,
	amountFormatOptions,
}: {
	org?: Organization;
	currency?: string | null;
	amount: number;
	maxFractionDigits?: number;
	minFractionDigits?: number;
	amountFormatOptions?: Intl.NumberFormatOptions;
}) => {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || org?.default_currency || "USD",
		minimumFractionDigits: minFractionDigits,
		maximumFractionDigits: maxFractionDigits,
		...amountFormatOptions,
	}).format(amount);
};
