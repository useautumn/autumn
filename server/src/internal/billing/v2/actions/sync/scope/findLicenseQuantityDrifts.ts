import type {
	FullCusProduct,
	FullCustomerLicense,
	SyncPlanInstance,
} from "@autumn/shared";

/** A pool whose counters no longer agree with the Stripe subscription. */
export type LicenseQuantityDrift = {
	/** The linked parent customer product that owns the pool. */
	linkedCustomerProduct: FullCusProduct;
	/** The pool row to converge. */
	customerLicense: FullCustomerLicense;
	/** Desired total seats (included + Stripe paid quantity), attach semantics. */
	totalQuantity: number;
};

/**
 * Quantity-only drift between the Stripe sub's license items and the linked
 * parent's pools. Pools with no matching Stripe entry, and license items with
 * no existing pool (a pool-creation change), are not reported here.
 */
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
