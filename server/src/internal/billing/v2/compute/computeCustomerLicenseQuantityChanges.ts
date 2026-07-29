import type {
	CustomerLicenseQuantity,
	CustomerLicenseUpdate,
	FullCusProduct,
	FullCustomerLicense,
} from "@autumn/shared";

export type CustomerLicenseQuantityChange = {
	customerLicense: FullCustomerLicense;
	paidQuantity: number;
	update: CustomerLicenseUpdate;
};

export const computeCustomerLicenseQuantityChanges = ({
	customerProduct,
	customerLicenseQuantities,
}: {
	customerProduct: FullCusProduct;
	customerLicenseQuantities: CustomerLicenseQuantity[] | undefined;
}): CustomerLicenseQuantityChange[] => {
	const changes: CustomerLicenseQuantityChange[] = [];

	for (const quantity of customerLicenseQuantities ?? []) {
		const customerLicense = customerProduct.customer_licenses?.find(
			(pool) => pool.planLicense?.product.id === quantity.licensePlanId,
		);
		if (!customerLicense) continue;

		const included = customerLicense.granted - customerLicense.paid_quantity;
		const paidQuantity = Math.max(0, quantity.totalQuantity - included);
		if (paidQuantity === customerLicense.paid_quantity) continue;

		changes.push({
			customerLicense,
			paidQuantity,
			update: {
				customerLicenseId: customerLicense.id,
				remainingChange: 0,
				paidQuantity,
			},
		});
	}

	return changes;
};
