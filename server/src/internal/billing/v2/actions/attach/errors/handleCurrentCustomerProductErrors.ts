import { type AttachBillingContext, RecaseError } from "@autumn/shared";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { currentCustomerProduct, attachProduct } = billingContext;

	if (currentCustomerProduct?.product.id === attachProduct.id) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${currentCustomerProduct.product.name}' is the same as the product being attached`,
		});
	}
};
