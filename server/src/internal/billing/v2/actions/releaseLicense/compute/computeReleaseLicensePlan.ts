import type { AutumnBillingPlan } from "@autumn/shared";
import type { ReleaseLicenseContext, ReleaseLicensePlan } from "../types.js";
import { computeCustomerLicenseRemainingChanges } from "./computeCustomerLicenseRemainingChanges.js";
import { computeEntityCustomerProductUpdates } from "./computeEntityCustomerProductUpdates.js";

export const computeReleaseLicensePlan = ({
	context,
}: {
	context: ReleaseLicenseContext;
}): ReleaseLicensePlan => {
	const { fullCustomer, releases } = context;

	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [],
		updateCustomerProducts: computeEntityCustomerProductUpdates({
			assignments: releases.map((release) => release.assignment),
			releasedAt: Date.now(),
		}),
		customerLicenseUpdates: computeCustomerLicenseRemainingChanges({
			customerLicenseLinkIds: releases.map(
				(release) => release.customerLicense.link_id,
			),
		}),
	};

	return { billingPlan };
};
