import {
	type AttachBillingContext,
	isCustomerProductPaid,
	RecaseError,
} from "@autumn/shared";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { currentCustomerProduct, attachProduct, stripeSubscription } =
		billingContext;

	if (currentCustomerProduct?.product.id === attachProduct.id) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${currentCustomerProduct.product.name}' is the same as the product being attached`,
		});
	}

	if (isCustomerProductPaid(currentCustomerProduct) && !stripeSubscription) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${currentCustomerProduct?.product.name}' is paid but no stripe subscription is linked to it`,
		});
	}
};
