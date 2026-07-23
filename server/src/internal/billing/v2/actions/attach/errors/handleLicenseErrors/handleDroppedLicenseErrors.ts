import {
	type AttachBillingContext,
	customerLicenseToUsage,
	ErrCode,
	type FullCustomerLicense,
	RecaseError,
} from "@autumn/shared";
import { matchCustomerLicensePlanSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors.js";

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

/** Blocks ambiguous mappings; dropped pools inherit their parent's lifecycle. */
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

	for (const { outgoingCustomerLicense, reason, group } of unmatched) {
		if (reason === "dropped") continue;
		const used = customerLicenseToUsage({
			customerLicense: outgoingCustomerLicense,
		});
		if (used === 0) continue;

		const licensePlanId = licensePlanIdOf(outgoingCustomerLicense);
		throw new RecaseError({
			message:
				`License changes conflict with active license assignments: ` +
				`${used} assigned for ${licensePlanId}, but the licenses in group "${group}" ` +
				"are not a 1:1 match on the incoming plan. Release licenses first.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
