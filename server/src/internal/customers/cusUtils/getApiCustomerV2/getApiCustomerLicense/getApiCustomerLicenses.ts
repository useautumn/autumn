import {
	ACTIVE_STATUSES,
	type ApiCustomerLicenseV0,
	type CusProductStatus,
	customerLicenseToUsage,
	type FullCusProduct,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

/**
 * Serializes the customer's license pools from their (already hydrated)
 * customer products — live parents only, broken links skipped.
 */
export const getApiCustomerLicenses = ({
	ctx,
	customerProducts,
}: {
	ctx: RequestContext;
	customerProducts: FullCusProduct[];
}): ApiCustomerLicenseV0[] => {
	return customerProducts
		.filter((customerProduct) =>
			ACTIVE_STATUSES.includes(customerProduct.status as CusProductStatus),
		)
		.flatMap((customerProduct) =>
			(customerProduct.customer_licenses ?? []).flatMap((customerLicense) => {
				const { planLicense } = customerLicense;
				if (!planLicense) return [];

				return [
					{
						license_plan_id: planLicense.product.id,
						parent_plan_id: customerProduct.product.id,
						license_plan_name: planLicense.product.name ?? "",
						granted: customerLicense.granted,
						usage: customerLicenseToUsage({ customerLicense }),
						remaining: customerLicense.remaining,
						paid_quantity: customerLicense.paid_quantity,
					},
				];
			}),
		)
		.sort(
			(a, b) =>
				a.parent_plan_id.localeCompare(b.parent_plan_id) ||
				a.license_plan_id.localeCompare(b.license_plan_id),
		);
};
