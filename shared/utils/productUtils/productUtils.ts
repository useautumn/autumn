import { Decimal } from "decimal.js";
import {
	type CreateFreeTrial,
	type FreeTrial,
	isFreeProduct,
	type Price,
	type ProductItem,
	type ProductV2,
} from "../../index.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../productV2Utils/productItemUtils/getItemType.js";
import { nullish } from "../utils.js";

export const isDefaultTrialV2 = ({
	freeTrial,
	items,
	isDefault,
}: {
	freeTrial?: CreateFreeTrial;
	items: ProductItem[];
	isDefault: boolean;
}) => {
	if (!freeTrial) return false;

	return (
		freeTrial.card_required === false &&
		isDefault &&
		!isFreeProductV2({ items })
	);
};

export const isOneOffProductV2 = ({ items }: { items: ProductItem[] }) => {
	return (
		items.some((i) => isPriceItem(i) || isFeaturePriceItem(i)) &&
		items.every((i) => {
			if (isPriceItem(i) || isFeaturePriceItem(i)) {
				return i.interval === null;
			}
			return true;
		})
	);
};

export const isFreeProductV2 = ({ items }: { items: ProductItem[] }) => {
	return items.every((item) => nullish(item.price) && nullish(item.tiers));
};

export const isProductUpgradeV2 = ({
	items1,
	items2,
}: {
	items1: ProductItem[];
	items2: ProductItem[];
}) => {
	if (
		!isFreeProductV2({ items: items1 }) &&
		isFreeProductV2({ items: items2 })
	) {
		return false;
	}

	const prices1 = items1.filter(
		(item) => isFeaturePriceItem(item) || isPriceItem(item),
	);
	const prices2 = items2.filter(
		(item) => isFeaturePriceItem(item) || isPriceItem(item),
	);

	// 2. Get total price for each product
	const getTotalPrice = (items: ProductItem[]) => {
		let totalPrice = new Decimal(0);
		for (const item of items) {
			if (item.price) totalPrice = totalPrice.plus(item.price);
			if (item.tiers) {
				const tierTotal = item.tiers.reduce(
					(acc, tier) => acc.plus(tier.amount),
					new Decimal(0),
				);
				totalPrice = totalPrice.plus(tierTotal);
			}
		}
		return totalPrice.toNumber();
	};

	// Return interval...?

	return getTotalPrice(prices1) < getTotalPrice(prices2);
};

export const sortProductsV2 = ({ products }: { products: ProductV2[] }) => {
	products.sort((a, b) => {
		if (a.is_add_on !== b.is_add_on) {
			return a.is_add_on ? 1 : -1;
		}

		return 0;
	});

	return products.sort((a, b) => {
		// Secondary sort: by add-on status (non-add-ons first)
		if (a.is_add_on !== b.is_add_on) {
			return a.is_add_on ? 1 : -1;
		}

		// Primary sort: by price (using upgrade logic)
		const isUpgrade = isProductUpgradeV2({
			items1: a.items,
			items2: b.items,
		});

		return isUpgrade ? -1 : 1;
	});
};

export const isDefaultTrial = ({
	freeTrial,
	isDefault,
	prices,
}: {
	freeTrial?: CreateFreeTrial | FreeTrial;
	isDefault: boolean;
	prices: Price[];
}) => {
	if (!freeTrial) return false;

	return (
		freeTrial.card_required === false && isDefault && !isFreeProduct({ prices })
	);
};
