import type { FullCustomerPrice, UsagePriceConfig } from "@autumn/shared";

export const findCusPriceByFeature = ({
	internalFeatureId,
	cusPrices,
}: {
	internalFeatureId: string;
	cusPrices: FullCustomerPrice[];
}) => {
	return cusPrices.find((cusPrice) => {
		const config = cusPrice.price.config as UsagePriceConfig;
		return config.internal_feature_id === internalFeatureId;
	});
};
