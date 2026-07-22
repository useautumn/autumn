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

/** Blocks ambiguous active assignment mappings; dropped pools release in compute. */
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
				`${used} assigned for ${licensePlanId}, but Autumn cannot determine which ` +
				`incoming license should receive them in group "${group}". Release the ` +
				"assignments first, or configure a single matching license for that group.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
