import {
	type AttachParamsV1,
	cp,
	type FullCusProduct,
	type FullCustomer,
	findActiveCustomerProductById,
} from "@autumn/shared";

export const setupAttachLicenseTransitionSource = ({
	fullCustomer,
	params,
	currentCustomerProduct,
}: {
	fullCustomer: FullCustomer;
	params: AttachParamsV1;
	currentCustomerProduct?: FullCusProduct;
}): FullCusProduct | undefined => {
	if (currentCustomerProduct) return currentCustomerProduct;

	const removedProductIds = new Set(
		(params.remove_plan_ids ?? []).filter(
			(productId) => productId !== params.plan_id,
		),
	);

	const removedCustomerProductsWithLicenses = [...removedProductIds].flatMap(
		(productId) => {
			const customerProduct = findActiveCustomerProductById({
				fullCus: fullCustomer,
				productId,
			});
			if (!customerProduct) return [];
			if (!cp(customerProduct).recurring().main().valid) return [];
			if ((customerProduct.customer_licenses ?? []).length === 0) return [];
			return [customerProduct];
		},
	);

	return removedCustomerProductsWithLicenses.length === 1
		? removedCustomerProductsWithLicenses[0]
		: undefined;
};
