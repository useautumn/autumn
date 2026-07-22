import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { matchCustomerLicenseSuccessors } from "./matchCustomerLicenseSuccessors.js";

export const computeCustomerLicenseReleases = ({
	outgoingCustomerProduct,
	incomingCustomerProduct,
	releasedAt,
}: {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct?: FullCusProduct;
	releasedAt: number;
}): Pick<AutumnBillingPlan, "releaseCustomerLicenseAssignments"> => {
	const { unmatched } = matchCustomerLicenseSuccessors({
		outgoingCustomerLicenses: outgoingCustomerProduct.customer_licenses ?? [],
		incomingCustomerLicenses: incomingCustomerProduct?.customer_licenses ?? [],
	});
	const customerLicensePools = unmatched.flatMap(
		({ outgoingCustomerLicense, reason }) =>
			reason === "dropped"
				? [
						{
							id: outgoingCustomerLicense.id,
							linkId: outgoingCustomerLicense.link_id,
						},
					]
				: [],
	);

	return {
		releaseCustomerLicenseAssignments: customerLicensePools.length
			? {
					internalCustomerId: outgoingCustomerProduct.internal_customer_id,
					customerLicensePools,
					releasedAt,
				}
			: undefined,
	};
};
