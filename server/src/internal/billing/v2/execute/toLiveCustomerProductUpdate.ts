import {
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	findActiveCustomerProductById,
	findMainActiveCustomerProductByGroup,
} from "@autumn/shared";

/** The row now holding a replaced plan's place: the same product, else a main plan's group successor. */
const findReplacementCustomerProduct = ({
	customerProduct,
	fullCustomer,
}: {
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}) => {
	const internalEntityId = customerProduct.internal_entity_id ?? undefined;

	const sameProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: customerProduct.product.id,
		internalEntityId,
	});
	if (sameProduct || customerProduct.product.is_add_on) return sameProduct;

	return findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId,
	});
};

/** A plan replaced since the invoice was created is expired through its current row instead. */
export const toLiveCustomerProductUpdate = ({
	update,
	fullCustomer,
}: {
	update: CustomerProductUpdate;
	fullCustomer: FullCustomer;
}): CustomerProductUpdate | undefined => {
	const isStillLive = fullCustomer.customer_products.some(
		(customerProduct) => customerProduct.id === update.customerProduct.id,
	);
	if (isStillLive) return update;

	const liveCustomerProduct = findReplacementCustomerProduct({
		customerProduct: update.customerProduct,
		fullCustomer,
	});
	if (!liveCustomerProduct) return undefined;

	return { ...update, customerProduct: liveCustomerProduct };
};
