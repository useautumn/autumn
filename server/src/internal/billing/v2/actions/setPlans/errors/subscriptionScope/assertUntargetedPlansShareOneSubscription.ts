import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	customerProductsToStripeSubscriptionIds,
	ErrCode,
	type FullCusProduct,
	isCusProductOnEntity,
	isOneOffProduct,
	notNullish,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { requestedPlans } from "./requestedPlans";

const liveRequestedCustomerProducts = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): FullCusProduct[] =>
	requestedPlans({ billingContext })
		.filter(({ fullProduct }) => !isOneOffProduct({ product: fullProduct }))
		.flatMap(({ fullProduct, internalEntityId }) =>
			billingContext.fullCustomer.customer_products.filter(
				(customerProduct) =>
					customerProduct.product.id === fullProduct.id &&
					customerProductHasRelevantStatus(customerProduct) &&
					isCusProductOnEntity({
						cusProduct: customerProduct,
						internalEntityId,
					}),
			),
		);

const replacedCustomerProducts = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): FullCusProduct[] =>
	billingContext.productContexts
		.flatMap(({ currentCustomerProduct, scheduledCustomerProduct }) => [
			currentCustomerProduct,
			scheduledCustomerProduct,
		])
		.filter(notNullish);

/** Without a target subscription, the plans a request touches must already share one. */
export const assertUntargetedPlansShareOneSubscription = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	if (billingContext.stripeSubscriptionScope) return;

	const stripeSubscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: [
			...liveRequestedCustomerProducts({ billingContext }),
			...replacedCustomerProducts({ billingContext }),
		],
	});
	if (stripeSubscriptionIds.length <= 1) return;

	throw new RecaseError({
		message: "Cannot update products across multiple existing subscriptions.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
