import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	customerLicenseToUsage,
	ErrCode,
	type FullCustomerLicense,
	RecaseError,
} from "@autumn/shared";
import { matchCustomerLicenseSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors.js";

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

/** Blocks an immediate switch that would strand active assignments: a used
 * outgoing pool must have a successor (same license plan, or a 1:1 group
 * match) on the incoming plan. */
export const handleDroppedLicenseErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { currentCustomerProduct, planTiming } = billingContext;
	if (planTiming !== "immediate" || !currentCustomerProduct) return;

	const { unmatched } = matchCustomerLicenseSuccessors({
		outgoingCustomerLicenses: currentCustomerProduct.customer_licenses ?? [],
		incomingCustomerLicenses: (
			autumnBillingPlan.insertCustomerProducts ?? []
		).flatMap((customerProduct) => customerProduct.customer_licenses ?? []),
	});

	for (const { outgoingCustomerLicense, reason, group } of unmatched) {
		const used = customerLicenseToUsage({
			customerLicense: outgoingCustomerLicense,
		});
		if (used === 0) continue;

		const licensePlanId = licensePlanIdOf(outgoingCustomerLicense);
		const conflict =
			reason === "ambiguous"
				? `the licenses in group "${group}" are not a 1:1 match on the incoming plan`
				: "the incoming plan drops the license";
		throw new RecaseError({
			message:
				`License changes conflict with active license assignments: ` +
				`${used} assigned for ${licensePlanId}, but ${conflict}. Release licenses first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
