import type { FullCustomer, FullSubject } from "@autumn/shared";

export const mergePooledTransferCustomer = ({
	fullCustomer,
	fullSubject,
}: {
	fullCustomer: FullCustomer;
	fullSubject: FullSubject;
}): FullCustomer => {
	const liveCustomerProductById = new Map(
		fullSubject.customer_products.map((customerProduct) => [
			customerProduct.id,
			customerProduct,
		]),
	);

	return {
		...fullCustomer,
		customer_products: fullCustomer.customer_products.map(
			(customerProduct) =>
				liveCustomerProductById.get(customerProduct.id) ?? customerProduct,
		),
		extra_customer_entitlements: fullSubject.extra_customer_entitlements,
	};
};
