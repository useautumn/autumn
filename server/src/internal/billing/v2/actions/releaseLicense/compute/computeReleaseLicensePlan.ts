import type { AutumnBillingPlan } from "@autumn/shared";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
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
		pooledBalanceOps: releases.flatMap(({ assignment }) => {
			const operation = customerProductToPooledBalanceRemovalOp({
				customerProduct: assignment,
				effectiveAt: null,
			});
			return operation ? [operation] : [];
		}),
	};

	return { billingPlan };
};
