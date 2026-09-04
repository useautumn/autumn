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

/**
 * Compute the intent for a subscription update
 */
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
	const licensesChanged = params.customize?.upsert_licenses !== undefined;
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = resolveFreeTrialParam(params) !== undefined;

	if (itemsChanged || licensesChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// Seat-count-only changes converge the pool in place — no plan restructure.
	if (params.license_quantities?.length)
		return UpdateSubscriptionIntent.UpdateLicenseQuantity;

	// ManualTopUp wins over UpdateQuantity (and CancelAction/None): once we know
	// this isn't a plan restructure, a feature_quantities entry whose prepaid
	// tie-break target is a one-off price on a recurring host routes here.
	// A recurring prepaid of the same feature wins the tie-break instead.
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

	// If no params and checkoutMode
	if (checkoutMode === "autumn_checkout") {
		const hasPrepaid = customerProductHasPrepaidPrice(customerProduct);

		if (hasPrepaid) {
			return UpdateSubscriptionIntent.UpdateQuantity;
		}
	}

	// If cancel action
	if (params.cancel_action) {
		return UpdateSubscriptionIntent.CancelAction;
	}

	return UpdateSubscriptionIntent.None;
};
