import {
	type AutumnBillingPlan,
	isOneOffPrice,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateQuantityDetails } from "./computeUpdateQuantityDetails";

export const computeUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { customerProduct, featureQuantities } = updateSubscriptionContext;

	// One-off prepaid mutations belong to the ManualTopUp intent. setupFeature-
	// QuantitiesContext synthesizes placeholders for every prepaid price (incl.
	// one-off), so filter them out here before computeUpdateQuantityDetails.
	const newOptions = featureQuantities.filter((option) => {
		const cusPrice = customerProduct.customer_prices.find(
			(cp) => cp.price.config.internal_feature_id === option.internal_feature_id,
		);
		return cusPrice ? !isOneOffPrice(cusPrice.price) : true;
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

	return {
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
