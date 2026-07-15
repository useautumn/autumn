import type {
	FullCusProduct,
	FullCustomerLicense,
	FullPlanLicense,
} from "@autumn/shared";

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

type CustomerLicenseWithPlanLicense = {
	customerLicense: FullCustomerLicense;
	planLicense: FullPlanLicense;
};

/** Pairs customer licenses within an already-known customer product transition.
 * Public product ids survive license-plan version changes. */
export const pairCustomerLicensesByLicensePlan = ({
	outgoingCustomerProduct,
	incomingCustomerProduct,
}: {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
}): CustomerLicensePair[] => {
	const incomingByLicensePlanId = new Map<
		string,
		CustomerLicenseWithPlanLicense
	>();

	const incomingCustomerLicenses =
		incomingCustomerProduct.customer_licenses ?? [];
	const outgoingCustomerLicenses =
		outgoingCustomerProduct.customer_licenses ?? [];

	for (const customerLicense of incomingCustomerLicenses) {
		const planLicense = customerLicense.planLicense;
		if (!planLicense) continue;

		const licensePlanId = planLicense.product.id;
		if (incomingByLicensePlanId.has(licensePlanId)) continue;

		incomingByLicensePlanId.set(licensePlanId, {
			customerLicense,
			planLicense,
		});
	}

	const pairs: CustomerLicensePair[] = [];
	for (const customerLicense of outgoingCustomerLicenses) {
		const planLicense = customerLicense.planLicense;
		if (!planLicense) continue;

		const incoming = incomingByLicensePlanId.get(planLicense.product.id);
		if (!incoming) continue;

		pairs.push({
			outgoingCustomerProduct,
			incomingCustomerProduct,
			outgoingCustomerLicense: customerLicense,
			incomingCustomerLicense: incoming.customerLicense,
			outgoingPlanLicense: planLicense,
			incomingPlanLicense: incoming.planLicense,
		});
	}

	return pairs;
};
