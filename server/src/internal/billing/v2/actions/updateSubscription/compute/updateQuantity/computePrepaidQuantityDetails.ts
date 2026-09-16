import {
	type DbPooledBalanceContribution,
	type FeatureOptions,
	findPrepaidQuantityTargetPrice,
	isOneOffPrice,
	type LineItem,
	notNullish,
	type UpdateCustomerEntitlement,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateQuantityDetails } from "./computeUpdateQuantityDetails.js";

export type PrepaidQuantityDetails = {
	updatedOptions: FeatureOptions[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
	lineItems: LineItem[];
	updatePoolContributions: DbPooledBalanceContribution[];
};

/** Converges every recurring prepaid option onto the requested quantity. */
export const computePrepaidQuantityDetails = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): PrepaidQuantityDetails => {
	const { customerProduct, featureQuantities } = billingContext;
	const applyImmediately = billingContext.requestedBillingCycleAnchor === "now";
	const requestedFeatureIds = new Set(
		params.feature_quantities?.map((quantity) => quantity.feature_id),
	);

	// Recurring prepaid wins over a one-off sibling; one-off mutations belong to ManualTopUp.
	const customerPrices = customerProduct.customer_prices.map(
		(customerPrice) => customerPrice.price,
	);
	const recurringPrepaidOptions = featureQuantities.filter((option) => {
		if (applyImmediately && !requestedFeatureIds.has(option.feature_id))
			return false;
		const targetPrice = findPrepaidQuantityTargetPrice({
			prices: customerPrices,
			internalFeatureId: option.internal_feature_id,
			featureId: option.feature_id,
		});
		return targetPrice ? !isOneOffPrice(targetPrice) : true;
	});

	const details = recurringPrepaidOptions.map((updatedOptions) =>
		computeUpdateQuantityDetails({
			ctx,
			updatedOptions,
			updateSubscriptionContext: billingContext,
			applyImmediately,
		}),
	);

	const updatedOptions = details.map((detail) => detail.updatedOptions);
	const updatedOptionsByFeature = new Map(
		(applyImmediately ? customerProduct.options : []).map((option) => [
			option.feature_id,
			option,
		]),
	);
	for (const option of updatedOptions)
		updatedOptionsByFeature.set(option.feature_id, option);
	return {
		updatedOptions: Array.from(updatedOptionsByFeature.values()),
		updateCustomerEntitlements: details.flatMap(
			(detail) => detail.updateCustomerEntitlements,
		),
		lineItems: details.flatMap((detail) => detail.lineItems),
		updatePoolContributions: details
			.map((detail) => detail.pooledContributionUpdate)
			.filter(notNullish),
	};
};
