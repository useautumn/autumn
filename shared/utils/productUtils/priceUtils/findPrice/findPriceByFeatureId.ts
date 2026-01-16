import type { Price } from "@models/productModels/priceModels/priceModels";

export const findPriceByFeatureId = ({
	prices,
	featureId,
}: {
	prices: Price[];
	featureId: string;
}) => {
	return prices.find((p) => p.config.feature_id === featureId);
};
