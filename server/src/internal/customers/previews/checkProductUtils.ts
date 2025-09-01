import type {
	Feature,
	Organization,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { getFeatureNameWithCapital } from "@/internal/features/utils/displayUtils.js";
import { getPriceText } from "@/internal/products/pricecn/pricecnUtils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { notNullish } from "@/utils/genUtils.js";
import { formatCurrency, formatTiers } from "./previewUtils.js";

export const getProductChargeText = ({
	product,
	org,
	features,
}: {
	product: ProductV2;
	org: Organization;
	features: Feature[];
}) => {
	const basePrices = product.items.filter((i) => isPriceItem(i));
	const total = basePrices.reduce((acc, curr) => acc + curr.price!, 0);

	const itemStrs = [];
	if (total > 0) {
		itemStrs.push(
			formatCurrency({
				amount: total,
				defaultCurrency: org.default_currency!,
			}),
		);
	}

	const prepaidPrices = product.items.filter(
		(i) => isFeaturePriceItem(i) && i.usage_model === "prepaid",
	);

	const prepaidStrings = prepaidPrices.map((i) => {
		const feature = features.find((f) => f.id === i.feature_id);
		const priceStr = formatTiers({
			tiers: i.tiers!,
			org,
		});

		const featureStr =
			i.billing_units && i.billing_units > 1
				? `${i.billing_units} ${feature?.name}`
				: feature?.name;

		return `${priceStr} / ${featureStr}`;
	});
	return [...itemStrs, ...prepaidStrings];
};

export const getItemDescription = ({
	item,
	features,
	product,
	org,
}: {
	item: ProductItem;
	features: Feature[];
	product: ProductV2;
	org: Organization;
}) => {
	const prices = product.items.filter((i) => !isFeatureItem(i));

	const _priceStr = getPriceText({
		item,
		org,
	});

	if (isPriceItem(item)) {
		const baseName =
			prices.length === 1
				? product.name
				: notNullish(item.interval)
					? "Subscription"
					: "One-time";

		return baseName;
	} else {
		const feature = features.find((f) => f.id === item.feature_id);
		// let pricecnItem = featurePricetoPricecnItem({
		//   feature,
		//   item,
		//   org,
		// });

		// // let combinedStr = pricecnItem.primaryText + " " + pricecnItem.secondaryText;
		// // combinedStr = `${feature?.name} - ${combinedStr}`;
		// // if (item.usage_model == "pay_per_use") {
		// //   combinedStr = `${combinedStr}`;
		// // }
		return `${getFeatureNameWithCapital({ feature: feature! })}`;
	}
};
