import type { AttachBillingContext } from "@autumn/shared";
import { assertNoAmbiguousDroppedLicenses } from "@/internal/billing/v2/common/errors/assertNoAmbiguousDroppedLicenses.js";
import { matchCustomerLicensePlanSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors.js";

export const handleDroppedLicenseErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { currentCustomerProduct, planTiming } = billingContext;
	if (planTiming !== "immediate" || !currentCustomerProduct) return;

	const { unmatched } = matchCustomerLicensePlanSuccessors({
		outgoingCustomerLicenses: currentCustomerProduct.customer_licenses ?? [],
		incomingPlanLicenses: billingContext.attachProduct.licenses ?? [],
	});

	assertNoAmbiguousDroppedLicenses({ unmatched });
};
