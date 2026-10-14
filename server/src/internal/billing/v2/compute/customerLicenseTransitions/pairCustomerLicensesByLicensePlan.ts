import type {
	FullCusProduct,
	FullCustomerLicense,
	FullPlanLicense,
} from "@autumn/shared";
import { matchCustomerLicenseSuccessors } from "./matchCustomerLicenseSuccessors.js";

export type CustomerLicensePair = {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
	outgoingCustomerLicense: FullCustomerLicense;
	incomingCustomerLicense: FullCustomerLicense;
	outgoingPlanLicense: FullPlanLicense;
	incomingPlanLicense: FullPlanLicense;
};

export const pairCustomerLicensesByLicensePlan = ({
	outgoingCustomerProduct,
	incomingCustomerProduct,
}: {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
}): CustomerLicensePair[] => {
	const { matches } = matchCustomerLicenseSuccessors({
		outgoingCustomerLicenses: outgoingCustomerProduct.customer_licenses ?? [],
		incomingCustomerLicenses: incomingCustomerProduct.customer_licenses ?? [],
	});

	return matches.flatMap(
		({ outgoingCustomerLicense, incomingCustomerLicense }) => {
			const outgoingPlanLicense = outgoingCustomerLicense.planLicense;
			const incomingPlanLicense = incomingCustomerLicense.planLicense;
			if (!outgoingPlanLicense || !incomingPlanLicense) return [];

			return [
				{
					outgoingCustomerProduct,
					incomingCustomerProduct,
					outgoingCustomerLicense,
					incomingCustomerLicense,
					outgoingPlanLicense,
					incomingPlanLicense,
				},
			];
		},
	);
};
