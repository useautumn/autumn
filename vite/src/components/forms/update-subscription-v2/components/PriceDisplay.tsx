import {
	formatAmount,
	formatInterval,
	isPriceItem,
	type ProductV2,
} from "@autumn/shared";

interface PriceDisplayProps {
	product?: ProductV2;
	currency: string;
}

export function PriceDisplay({ product, currency }: PriceDisplayProps) {
	const priceItem = product?.items?.find((i) => isPriceItem(i));

	if (!priceItem || priceItem.price === 0 || priceItem.price === undefined) {
		return <span className="text-t2">Free</span>;
	}

	const formattedPrice = formatAmount({
		currency,
		amount: priceItem.price ?? 0,
		amountFormatOptions: {
			style: "currency",
			currencyDisplay: "narrowSymbol",
		},
	});

	const intervalText = priceItem.interval
		? formatInterval({
				interval: priceItem.interval,
				intervalCount: priceItem.interval_count ?? 1,
			})
		: "one-off";

	return (
		<span className="flex items-center gap-1">
			<span className="text-t1 font-semibold">{formattedPrice}</span>
			<span className="text-t3">{intervalText}</span>
		</span>
	);
}
