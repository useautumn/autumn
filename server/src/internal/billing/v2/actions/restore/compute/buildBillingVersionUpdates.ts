import {
	type AutumnBillingPlan,
	BillingVersion,
	type FullCusProduct,
} from "@autumn/shared";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

export const buildBillingVersionUpdates = ({
	fullCustomer,
	stripeSubscriptionId,
}: {
	fullCustomer: { customer_products: FullCusProduct[] };
	stripeSubscriptionId: string;
}): CustomerProductUpdate[] =>
	fullCustomer.customer_products
		.filter(
			(customerProduct) =>
				customerProduct.subscription_ids?.includes(stripeSubscriptionId) &&
				customerProduct.billing_version !== BillingVersion.V2,
		)
		.map((customerProduct) => ({
			customerProduct,
			updates: { billing_version: BillingVersion.V2 },
		}));
