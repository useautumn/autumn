import {
	type FullCustomer,
	findCustomerProductById,
	fullCustomerToCustomerLicenses,
	mapToProductV2,
	type ProductV2,
} from "@autumn/shared";

export const resolveCustomerLicenseProduct = ({
	customer,
	licensePlanId,
	parentPlanId,
	catalogProduct,
}: {
	customer: FullCustomer;
	licensePlanId: string;
	parentPlanId: string;
	catalogProduct?: ProductV2;
}): ProductV2 | null => {
	const customerLicense = fullCustomerToCustomerLicenses({
		fullCustomer: customer,
	}).find((candidate) => {
		const parentCustomerProduct = findCustomerProductById({
			fullCustomer: customer,
			customerProductId: candidate.parent_customer_product_id,
		});

		return (
			candidate.planLicense?.product.id === licensePlanId &&
			parentCustomerProduct?.product.id === parentPlanId
		);
	});

	return customerLicense?.planLicense
		? mapToProductV2({ product: customerLicense.planLicense.product })
		: (catalogProduct ?? null);
};
