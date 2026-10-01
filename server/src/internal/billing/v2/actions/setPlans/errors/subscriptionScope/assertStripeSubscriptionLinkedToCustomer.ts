import {
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import { setPlansError } from "../setPlansError";

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

	throw setPlansError({
		details: {
			type: "subscription_not_linked",
			stripe_subscription_id: stripeSubscriptionId,
		},
	});
};
