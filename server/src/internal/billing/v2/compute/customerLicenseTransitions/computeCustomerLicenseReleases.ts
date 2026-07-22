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
	const customerLicenseLinkIds = unmatched.flatMap(
		({ outgoingCustomerLicense, reason }) =>
			reason === "dropped" ? [outgoingCustomerLicense.link_id] : [],
	);

	return {
		releaseCustomerLicenseAssignments: customerLicenseLinkIds.length
			? { customerLicenseLinkIds, releasedAt }
			: undefined,
	};
};
