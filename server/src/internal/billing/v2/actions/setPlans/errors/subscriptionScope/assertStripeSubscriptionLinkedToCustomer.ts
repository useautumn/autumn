import {
	ErrCode,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
	RecaseError,
} from "@autumn/shared";

export const assertStripeSubscriptionLinkedToCustomer = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}) => {
	const isLinked = customerProducts.some((customerProduct) =>
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId,
		}),
	);
	if (isLinked) return;

	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message: `Subscription ${stripeSubscriptionId} isn't linked to any of this customer's plans.`,
		statusCode: 400,
	});
};
