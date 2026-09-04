import {
	type AutumnBillingPlan,
	findPrepaidQuantityTargetPrice,
	isOneOffPrice,
	notNullish,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import { computeUpdateQuantityDetails } from "./computeUpdateQuantityDetails";

export const computeUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { customerProduct, featureQuantities } = updateSubscriptionContext;

	// One-off prepaid mutations belong to the ManualTopUp intent. Drop an option
	// only when the feature's prepaid tie-break target is one-off — a recurring
	// prepaid sibling of the same feature wins the quantity instead.
	const customerPrices = customerProduct.customer_prices.map(
		(customerPrice) => customerPrice.price,
	);
	const newOptions = featureQuantities.filter((option) => {
		const targetPrice = findPrepaidQuantityTargetPrice({
			prices: customerPrices,
			internalFeatureId: option.internal_feature_id,
			featureId: option.feature_id,
		});
		return targetPrice ? !isOneOffPrice(targetPrice) : true;
	});

	const quantityUpdateDetails = newOptions.map((updatedOptions) =>
		computeUpdateQuantityDetails({
			ctx,
			updatedOptions,
			updateSubscriptionContext,
		}),
	);

	const lineItems = quantityUpdateDetails.flatMap((detail) => detail.lineItems);
	const updatedOptions = quantityUpdateDetails.map(
		(detail) => detail.updatedOptions,
	);
	const updatePoolContributions = quantityUpdateDetails
		.map((detail) => detail.pooledContributionUpdate)
		.filter(notNullish);

	return {
		...(updatePoolContributions.length > 0
			? {
					pooledBalancePlan: {
						...emptyPooledBalancePlan(),
						updatePoolContributions,
					},
				}
			: {}),
		customerId: updateSubscriptionContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: {
			customerProduct,
			updates: {
				options: updatedOptions,
			},
		},

		updateCustomerEntitlements: quantityUpdateDetails.flatMap(
			(detail) => detail.updateCustomerEntitlements,
		),

		lineItems,
	};
};
