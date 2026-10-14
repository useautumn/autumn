import { hasCustomItems } from "@api/billing/common/customizePlan/customizePlanV1";
import {
	type CheckoutMode,
	cusProductToPrices,
	customerProductHasPrepaidPrice,
	type FullCusProduct,
	findPrepaidQuantityTargetPrice,
	isCustomerProductOneOff,
	isOneOffPrice,
	resolveFreeTrialParam,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const setupUpdateSubscriptionIntent = ({
	params,
	checkoutMode,
	customerProduct,
}: {
	params: UpdateSubscriptionV1Params;
	checkoutMode: CheckoutMode;
	customerProduct: FullCusProduct;
}): UpdateSubscriptionIntent => {
	const featureQuantitiesParams = params.feature_quantities ?? [];

	const itemsChanged = hasCustomItems(params.customize);
	const licensesChanged = (params.customize?.upsert_licenses?.length ?? 0) > 0;
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = resolveFreeTrialParam(params) !== undefined;

	if (itemsChanged || licensesChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	if (params.license_quantities?.length)
		return UpdateSubscriptionIntent.UpdateQuantity;

	if (
		!isCustomerProductOneOff(customerProduct) &&
		featureQuantitiesParams.length > 0
	) {
		const prices = cusProductToPrices({ cusProduct: customerProduct });
		const targetsOneOffPrepaid = featureQuantitiesParams.some((fq) => {
			const targetPrice = findPrepaidQuantityTargetPrice({
				prices,
				featureId: fq.feature_id,
			});
			return targetPrice !== undefined && isOneOffPrice(targetPrice);
		});

		if (targetsOneOffPrepaid) return UpdateSubscriptionIntent.ManualTopUp;
	}

	if (featureQuantitiesParams.length > 0) {
		return UpdateSubscriptionIntent.UpdateQuantity;
	}

	if (checkoutMode === "autumn_checkout") {
		const hasPrepaid = customerProductHasPrepaidPrice(customerProduct);

		if (hasPrepaid) {
			return UpdateSubscriptionIntent.UpdateQuantity;
		}
	}

	if (params.cancel_action) {
		return UpdateSubscriptionIntent.CancelAction;
	}

	return UpdateSubscriptionIntent.None;
};
