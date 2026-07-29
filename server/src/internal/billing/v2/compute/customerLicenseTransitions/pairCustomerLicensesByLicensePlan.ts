import type {
	FullCusProduct,
	FullCustomerLicense,
	FullPlanLicense,
} from "@autumn/shared";
import { matchCustomerLicenseSuccessors } from "./matchCustomerLicenseSuccessors.js";

/** A pair always carries both effective licenses — rows with a dead link
 * never pair, so consumers need no null handling. The parent customer
 * products ride along for ops that describe the full transition. */
export type CustomerLicensePair = {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
	outgoingCustomerLicense: FullCustomerLicense;
	incomingCustomerLicense: FullCustomerLicense;
	outgoingPlanLicense: FullPlanLicense;
	incomingPlanLicense: FullPlanLicense;
};

/** Pairs customer licenses within an already-known customer product
 * transition. Same license plan ids pair first (public ids survive version
 * changes); cross-plan pools pair 1:1 by license plan group. */
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
