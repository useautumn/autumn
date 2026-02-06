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
}: {
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	quantityDifferenceForEntitlements: number;
	customerPrice: FullCustomerPrice;
}): FeatureOptions => {
	const isUpgrade = quantityDifferenceForEntitlements > 0;

	const { shouldApplyProration } = priceToProrationConfig({
		price: customerPrice.price,
		isUpgrade,
	});

	if (!isUpgrade && !shouldApplyProration) {
		return {
			...previousOptions,
			upcoming_quantity: updatedOptions.quantity,
		};
	}

	return updatedOptions;
};
