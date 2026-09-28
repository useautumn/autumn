import {
	formatInterval,
	type PriceItem,
	type ProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
import { compactPriceLabel } from "./compactPriceLabel";
import { formatMoney } from "./formatMoney";

const intervalKey = (price: PriceItem) =>
	`${price.interval}-${price.interval_count ?? 1}`;

/** Sum of the plans' base prices, when they all bill on the same interval. */
export const recurringTotalLabel = ({
	products,
	currency,
}: {
	products: ProductV2[];
	currency: string;
}) => {
	const basePrices = products
		.map((product) => productV2ToBasePrice({ product }))
		.filter((price): price is PriceItem => !!price?.interval);
	const [firstPrice] = basePrices;
	if (!firstPrice) return undefined;

	const sharesInterval = basePrices.every(
		(price) => intervalKey(price) === intervalKey(firstPrice),
	);
	if (!sharesInterval) return undefined;

	const total = formatMoney({
		amount: basePrices.reduce((sum, price) => sum + price.price, 0),
		currency,
	});
	const interval = formatInterval({
		interval: firstPrice.interval ?? undefined,
		intervalCount: firstPrice.interval_count ?? 1,
	});

	return compactPriceLabel(`${total} ${interval}`);
};
