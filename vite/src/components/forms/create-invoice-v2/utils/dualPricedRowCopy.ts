import {
	type Feature,
	formatAmount,
	getFeatureName,
	type ProductItem,
} from "@autumn/shared";

const flatPrice = (item: ProductItem) =>
	item.price ?? (item.tiers?.length === 1 ? item.tiers[0].amount : null);

/** Sales-facing copy for a feature billed as a prepaid pack plus usage beyond it; null for tiered prices. */
export function dualPricedRowCopy({
	prepaid,
	usage,
	prepaidQuantity,
	feature,
	currency,
}: {
	prepaid: ProductItem;
	usage: ProductItem;
	prepaidQuantity: number | undefined;
	feature: Feature | undefined;
	currency: string;
}): { prepaid: string | null; usage: string | null } {
	const name = (units: number) =>
		getFeatureName({ feature, units, capitalize: true });
	const amount = (value: number) =>
		formatAmount({
			currency,
			amount: value,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});

	const packPrice = flatPrice(prepaid);
	const packSize = prepaid.billing_units ?? 1;
	const unitPrice = flatPrice(usage);
	const after = prepaidQuantity
		? new Intl.NumberFormat().format(prepaidQuantity)
		: "prepaid";

	return {
		prepaid:
			packPrice === null
				? null
				: packSize > 1
					? `${amount(packPrice)} for ${new Intl.NumberFormat().format(packSize)} ${name(packSize)}`
					: `${amount(packPrice)} per ${name(1)}`,
		usage:
			unitPrice === null
				? null
				: `After ${after}, ${amount(unitPrice)} per ${name(1)}`,
	};
}
