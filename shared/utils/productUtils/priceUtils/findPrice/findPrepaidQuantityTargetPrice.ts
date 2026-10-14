import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { intervalToValue } from "@utils/intervalUtils";
import { isOneOffPrice, isPrepaidPrice } from "../classifyPriceUtils";

export const findPrepaidQuantityTargetPrice = ({
	prices,
	featureId,
	internalFeatureId,
}: {
	prices: Price[];
	featureId?: string | null;
	internalFeatureId?: string | null;
}): (Price & { config: UsagePriceConfig }) | undefined => {
	const prepaidPrices = prices.filter(
		(price): price is Price & { config: UsagePriceConfig } => {
			if (!isPrepaidPrice(price)) return false;
			if (internalFeatureId)
				return price.config.internal_feature_id === internalFeatureId;
			if (featureId) return price.config.feature_id === featureId;
			return false;
		},
	);

	const recurringPrepaidPrices = prepaidPrices
		.filter((price) => !isOneOffPrice(price))
		.sort(
			(a, b) =>
				intervalToValue(a.config.interval, a.config.interval_count) -
				intervalToValue(b.config.interval, b.config.interval_count),
		);

	return recurringPrepaidPrices[0] ?? prepaidPrices[0];
};

export const isLosingPrepaidQuantityPrice = ({
	price,
	prices,
}: {
	price: Price;
	prices: Price[];
}): boolean => {
	if (!isPrepaidPrice(price)) return false;

	const targetPrice = findPrepaidQuantityTargetPrice({
		prices,
		internalFeatureId: price.config.internal_feature_id,
		featureId: price.config.feature_id,
	});

	return targetPrice !== undefined && targetPrice.id !== price.id;
};
