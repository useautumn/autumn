import type { FullCusProduct, StripeSubscriptionScope } from "@autumn/shared";

export const isCustomerProductInStripeSubscriptionScope = ({
	stripeSubscriptionScope,
	customerProduct,
}: {
	stripeSubscriptionScope?: StripeSubscriptionScope;
	customerProduct: Pick<FullCusProduct, "id">;
}) =>
	!stripeSubscriptionScope ||
	stripeSubscriptionScope.customerProductIds.includes(customerProduct.id);

export const filterCustomerProductsInStripeSubscriptionScope = <
	CustomerProduct extends Pick<FullCusProduct, "id">,
>({
	stripeSubscriptionScope,
	customerProducts,
}: {
	stripeSubscriptionScope?: StripeSubscriptionScope;
	customerProducts: CustomerProduct[];
}) =>
	customerProducts.filter((customerProduct) =>
		isCustomerProductInStripeSubscriptionScope({
			stripeSubscriptionScope,
			customerProduct,
		}),
	);
