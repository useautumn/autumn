/** Amounts are major currency units (dollars, not cents) across Autumn APIs. */
export const formatMoney = ({
	amount,
	currency,
}: {
	amount: number;
	currency?: string | null;
}): string => {
	try {
		return new Intl.NumberFormat("en-US", {
			currency: (currency ?? "usd").toUpperCase(),
			currencyDisplay: "narrowSymbol",
			style: "currency",
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
};

export const formatEpochDate = (epochMs: number): string =>
	new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
		new Date(epochMs),
	);

export const formatCount = (value: number): string =>
	new Intl.NumberFormat("en-US").format(value);
