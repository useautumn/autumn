import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	customerProductsToRecurringActiveAndScheduled,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

const endsAfter = ({
	customerProduct,
	endsAt,
}: {
	customerProduct: FullCusProduct;
	endsAt: number;
}) => customerProduct.ended_at == null || customerProduct.ended_at > endsAt;

/** ends_at ends the whole live subscription, so plans the request leaves on it end there too. */
export const endRetainedSubscriptionCustomerProducts = ({
	billingContext,
	handledCustomerProductIds,
}: {
	billingContext: CreateScheduleBillingContext;
	handledCustomerProductIds: Set<string>;
}): CustomerProductUpdate[] => {
	const { endsAt, stripeSubscription } = billingContext;
	if (endsAt === undefined || !stripeSubscription) return [];

	const { recurringActive } = customerProductsToRecurringActiveAndScheduled({
		customerProducts: filterCustomerProductsByStripeSubscriptionId({
			customerProducts: billingContext.fullCustomer.customer_products,
			stripeSubscriptionId: stripeSubscription.id,
		}),
	});

	return recurringActive
		.filter(
			(customerProduct) =>
				!handledCustomerProductIds.has(customerProduct.id) &&
				endsAfter({ customerProduct, endsAt }),
		)
		.map((customerProduct) => ({
			customerProduct,
			updates: { ended_at: endsAt },
		}));
};
