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

	const count = (value: number) => new Intl.NumberFormat().format(value);
	const priced = ({ item, joiner }: { item: ProductItem; joiner: string }) => {
		const price = flatPrice(item);
		if (price === null) return null;
		const packSize = item.billing_units ?? 1;
		return packSize > 1
			? `${amount(price)} ${joiner} ${count(packSize)} ${name(packSize)}`
			: `${amount(price)} per ${name(1)}`;
	};
	const usagePrice = priced({ item: usage, joiner: "per" });
	const after = prepaidQuantity ? count(prepaidQuantity) : "prepaid";

	return {
		prepaid: priced({ item: prepaid, joiner: "for" }),
		usage: usagePrice && `After ${after}, ${usagePrice}`,
	};
}
