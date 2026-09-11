import {
	type DbPooledBalanceContribution,
	type FeatureOptions,
	findPrepaidQuantityTargetPrice,
	isOneOffPrice,
	type LineItem,
	notNullish,
	type UpdateCustomerEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateQuantityDetails } from "./computeUpdateQuantityDetails";

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
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}): PrepaidQuantityDetails => {
	const { customerProduct, featureQuantities } = billingContext;

	// One-off prepaid mutations belong to the ManualTopUp intent. Drop an option
	// only when the feature's prepaid tie-break target is one-off — a recurring
	// prepaid sibling of the same feature wins the quantity instead.
	const customerPrices = customerProduct.customer_prices.map(
		(customerPrice) => customerPrice.price,
	);
	const recurringPrepaidOptions = featureQuantities.filter((option) => {
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
		}),
	);

	return {
		updatedOptions: details.map((detail) => detail.updatedOptions),
		updateCustomerEntitlements: details.flatMap(
			(detail) => detail.updateCustomerEntitlements,
		),
		lineItems: details.flatMap((detail) => detail.lineItems),
		updatePoolContributions: details
			.map((detail) => detail.pooledContributionUpdate)
			.filter(notNullish),
	};
};
