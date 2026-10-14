import {
	type ApiCustomerLicenseV0,
	customerLicenseToUsage,
} from "@autumn/shared";
import type { CustomerLicenseState } from "../../reconcile/types.js";

export const getApiCustomerLicense = ({
	state,
}: {
	state: CustomerLicenseState;
}): ApiCustomerLicenseV0[] => {
	const liveParentById = new Map(
		state.parentCustomerProducts.map((parent) => [parent.id, parent]),
	);

	return state.customerLicenses
		.flatMap((customerLicense) => {
			const { planLicense } = customerLicense;
			if (!planLicense) return [];
			const parent = liveParentById.get(
				customerLicense.parent_customer_product_id,
			);
			if (!parent) return [];

			return [
				{
					license_plan_id: planLicense.product.id,
					parent_plan_id: parent.product.id,
					license_plan_name: planLicense.product.name ?? "",
					granted: customerLicense.granted,
					usage: customerLicenseToUsage({ customerLicense }),
					remaining: customerLicense.remaining,
					paid_quantity: customerLicense.paid_quantity,
				},
			];
		})
		.sort(
			(a, b) =>
				a.parent_plan_id.localeCompare(b.parent_plan_id) ||
				a.license_plan_id.localeCompare(b.license_plan_id),
		);
};
