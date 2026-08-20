type AdditionalCurrency = {
	currency: string;
	amount?: number | null;
	flat_amount?: number | null;
};

export const additionalCurrenciesToKey = ({
	currencies,
}: {
	currencies: AdditionalCurrency[] | null | undefined;
}): string =>
	[...(currencies ?? [])]
		.map(
			(entry) =>
				`${entry.currency.toLowerCase()}:${entry.amount ?? ""}:${entry.flat_amount ?? ""}`,
		)
		.sort()
		.join(",");
