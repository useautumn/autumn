import type {
	BillingContext,
	FeatureOptions,
	FullCustomerPrice,
} from "@autumn/shared";
import { billingContextToQuantityProrationConfig } from "./billingContextToQuantityProrationConfig";

export const computeFeatureOptionsChange = ({
	previousOptions,
	updatedOptions,
	quantityDifferenceForEntitlements,
	customerPrice,
	billingContext,
	applyImmediately = false,
}: {
	billingContext: BillingContext;
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	quantityDifferenceForEntitlements: number;
	customerPrice: FullCustomerPrice;
	applyImmediately?: boolean;
}): FeatureOptions => {
	const isUpgrade = quantityDifferenceForEntitlements > 0;

	const { shouldApplyProration } = billingContextToQuantityProrationConfig({
		billingContext,
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
