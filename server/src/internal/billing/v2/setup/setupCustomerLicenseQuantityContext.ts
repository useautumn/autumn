import {
	type CustomerLicenseQuantity,
	customerLicenseToUsage,
	type FullCusProduct,
	type FullProduct,
	type LicenseQuantityParams,
} from "@autumn/shared";
import { matchCustomerLicensesToPlanLicenses } from "../compute/customerLicenseTransitions/matchCustomerLicenseSuccessors.js";

/** Explicit quantities win; omitted successors cover their live assignments. */
export const setupCustomerLicenseQuantityContext = ({
	params,
	fullProduct,
	customerProduct,
}: {
	params: { license_quantities?: LicenseQuantityParams[] };
	fullProduct?: FullProduct;
	customerProduct?: FullCusProduct;
}): CustomerLicenseQuantity[] => {
	const explicit = (params.license_quantities ?? []).map((licenseQuantity) => ({
		licensePlanId: licenseQuantity.license_plan_id,
		totalQuantity: licenseQuantity.quantity,
	}));
	if (!fullProduct || !customerProduct) return explicit;

	const explicitLicensePlanIds = new Set(
		explicit.map(({ licensePlanId }) => licensePlanId),
	);
	const matches = matchCustomerLicensesToPlanLicenses({
		outgoingCustomerLicenses: customerProduct.customer_licenses ?? [],
		incomingPlanLicenses: fullProduct.licenses ?? [],
	});
	const carried = matches.flatMap(
		({ outgoingCustomerLicense, incomingPlanLicense }) => {
			const licensePlanId = incomingPlanLicense.product.id;
			if (explicitLicensePlanIds.has(licensePlanId)) return [];
			const includedChanged =
				outgoingCustomerLicense.planLicense?.included !== undefined &&
				outgoingCustomerLicense.planLicense.included !==
					incomingPlanLicense.included;
			const paidQuantity = includedChanged
				? Math.max(
						0,
						customerLicenseToUsage({
							customerLicense: outgoingCustomerLicense,
						}) - incomingPlanLicense.included,
					)
				: outgoingCustomerLicense.paid_quantity;

			return [
				{
					licensePlanId,
					totalQuantity: incomingPlanLicense.included + paidQuantity,
				},
			];
		},
	);

	return [...explicit, ...carried];
};
