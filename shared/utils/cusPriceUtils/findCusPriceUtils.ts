import {
	type FullCustomerPrice,
	InternalError,
	type UsagePriceConfig,
} from "@autumn/shared";

// Overload: errorOnNotFound = true → guaranteed FullCustomerPrice
export function findCusPriceByFeature(params: {
	internalFeatureId: string;
	cusPrices: FullCustomerPrice[];
	errorOnNotFound: true;
}): FullCustomerPrice;

// Overload: errorOnNotFound = false/undefined → FullCustomerPrice | undefined
export function findCusPriceByFeature(params: {
	internalFeatureId: string;
	cusPrices: FullCustomerPrice[];
	errorOnNotFound?: false;
}): FullCustomerPrice | undefined;

// Implementation
export function findCusPriceByFeature({
	internalFeatureId,
	cusPrices,
	errorOnNotFound,
}: {
	internalFeatureId: string;
	cusPrices: FullCustomerPrice[];
	errorOnNotFound?: boolean;
}): FullCustomerPrice | undefined {
	const result = cusPrices.find((cusPrice) => {
		const config = cusPrice.price.config as UsagePriceConfig;
		return config.internal_feature_id === internalFeatureId;
	});

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Customer price not found for internal_feature_id: ${internalFeatureId}`,
		});
	}

	return result;
}
