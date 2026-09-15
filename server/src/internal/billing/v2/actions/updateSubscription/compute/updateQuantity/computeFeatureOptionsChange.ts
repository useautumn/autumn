import {
	type FeatureOptions,
	type FullCustomerPrice,
	priceToProrationConfig,
} from "@autumn/shared";

export const computeFeatureOptionsChange = ({
	previousOptions,
	updatedOptions,
	quantityDifferenceForEntitlements,
	customerPrice,
	applyImmediately = false,
}: {
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	quantityDifferenceForEntitlements: number;
	customerPrice: FullCustomerPrice;
	applyImmediately?: boolean;
}): FeatureOptions => {
	const isUpgrade = quantityDifferenceForEntitlements > 0;

	const { shouldApplyProration } = priceToProrationConfig({
		price: customerPrice.price,
		isUpgrade,
	});

	if (!applyImmediately && !isUpgrade && !shouldApplyProration) {
		return {
			...previousOptions,
			upcoming_quantity: updatedOptions.quantity,
		};
	}

	return applyImmediately
		? { ...updatedOptions, upcoming_quantity: null }
		: updatedOptions;
};
