import type {
	FullCusProduct,
	FullCustomerLicense,
	SyncPlanInstance,
} from "@autumn/shared";

export type LicenseQuantityDrift = {
	linkedCustomerProduct: FullCusProduct;
	customerLicense: FullCustomerLicense;
	totalQuantity: number;
};

export const findLicenseQuantityDrifts = ({
	linkedCustomerProduct,
	syncPlan,
}: {
	linkedCustomerProduct: FullCusProduct;
	syncPlan: SyncPlanInstance;
}): LicenseQuantityDrift[] => {
	const drifts: LicenseQuantityDrift[] = [];

	for (const licenseQuantity of syncPlan.license_quantities ?? []) {
		const customerLicense = linkedCustomerProduct.customer_licenses?.find(
			(pool) =>
				pool.planLicense?.product.id === licenseQuantity.license_plan_id,
		);
		if (!customerLicense) continue;
		if (customerLicense.granted === licenseQuantity.quantity) continue;

		drifts.push({
			linkedCustomerProduct,
			customerLicense,
			totalQuantity: licenseQuantity.quantity,
		});
	}

	return drifts;
};
