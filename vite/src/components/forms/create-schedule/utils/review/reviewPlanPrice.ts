import {
	type Feature,
	findFeatureById,
	getFeatureName,
	isFeaturePriceItem,
	numberWithCommas,
	type ProductItem,
	type ProductV2,
	productV2ToBasePrice,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import {
	intervalSuffix,
	isAbbreviatedInterval,
} from "@/utils/formatUtils/intervalSuffix";
import {
	getBasePriceDisplay,
	PRICE_VARIES_LABEL,
} from "@/utils/product/basePriceDisplayUtils";
import { formatMoney } from "./formatMoney";
import type { ReviewChangeValue } from "./types/reviewChange";

const firstUnitAmount = (item: ProductItem) =>
	item.price ?? item.tiers?.[0]?.amount ?? null;

const unitLabel = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const billingUnits = item.billing_units ?? 1;
	const feature = item.feature_id
		? findFeatureById({ features, featureId: item.feature_id })
		: undefined;
	const name =
		getFeatureName({ feature, units: billingUnits }).toLowerCase() ||
		(item.feature_id ?? "");

	return billingUnits > 1 ? `${numberWithCommas(billingUnits)} ${name}` : name;
};

/** A plan with no base price shows its first feature's unit price, e.g. "From $10/seat +1". */
const featureUnitPrice = ({
	product,
	features,
	currency,
}: {
	product: ProductV2;
	features: Feature[];
	currency: string;
}): ReviewChangeValue | undefined => {
	const pricedItems = product.items.filter(isFeaturePriceItem);
	const [item] = pricedItems;
	const amount = item ? firstUnitAmount(item) : null;
	if (!item || amount === null) return undefined;

	const price = formatMoney({ amount, currency });
	const isTiered = (item.tiers?.length ?? 0) > 1;
	const otherPricedCount = pricedItems.length - 1;

	return {
		amount: `${isTiered ? "From " : ""}${price}`,
		suffix: `/${unitLabel({ item, features })}${otherPricedCount > 0 ? ` +${otherPricedCount}` : ""}`,
	};
};

export const reviewPlanPrice = ({
	product,
	features,
	currency,
}: {
	product: ProductV2;
	features: Feature[];
	currency: string;
}): ReviewChangeValue => {
	const display = getBasePriceDisplay({
		product: productV2ToFrontendProduct({ product }),
		currency,
	});
	if (display.type === "variable") {
		return (
			featureUnitPrice({ product, features, currency }) ?? {
				amount: PRICE_VARIES_LABEL,
			}
		);
	}

	const basePrice = productV2ToBasePrice({ product });
	const interval = basePrice?.interval;
	if (display.formattedAmount && interval && isAbbreviatedInterval(interval)) {
		return {
			amount: display.formattedAmount,
			suffix: intervalSuffix({
				interval,
				intervalCount: basePrice.interval_count ?? 1,
			}),
		};
	}
	return { amount: display.displayText };
};
