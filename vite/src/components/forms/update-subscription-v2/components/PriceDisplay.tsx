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

type ProductPriceDisplay =
	| { type: "free" }
	| { type: "price"; formattedPrice: string; intervalText: string };

export function getProductPriceDisplay({
	product,
	currency,
}: PriceDisplayProps): ProductPriceDisplay {
	const priceItem = product?.items?.find((i) => isPriceItem(i));

	if (!priceItem || priceItem.price === 0 || priceItem.price === undefined) {
		return { type: "free" };
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

	return { type: "price", formattedPrice, intervalText };
}

export function PriceDisplay({ product, currency }: PriceDisplayProps) {
	const priceDisplay = getProductPriceDisplay({ product, currency });

	if (priceDisplay.type === "free") {
		return <span className="text-t2">Free</span>;
	}

	return (
		<span className="flex items-center gap-1">
			<span className="text-t1 font-semibold">{priceDisplay.formattedPrice}</span>
			<span className="text-t3">{priceDisplay.intervalText}</span>
		</span>
	);
}
