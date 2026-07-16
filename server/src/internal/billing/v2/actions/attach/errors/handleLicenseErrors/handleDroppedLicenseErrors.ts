import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	customerLicenseToUsage,
	ErrCode,
	type FullCustomerLicense,
	RecaseError,
} from "@autumn/shared";

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

export const handleDroppedLicenseErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { currentCustomerProduct, planTiming } = billingContext;
	if (planTiming !== "immediate" || !currentCustomerProduct) return;

	const incomingLicensePlanIds = new Set(
		(autumnBillingPlan.insertCustomerProducts ?? []).flatMap(
			(customerProduct) =>
				(customerProduct.customer_licenses ?? []).map(licensePlanIdOf),
		),
	);

	for (const outgoingPool of currentCustomerProduct.customer_licenses ?? []) {
		const used = customerLicenseToUsage({ customerLicense: outgoingPool });
		if (used === 0) continue;
		if (incomingLicensePlanIds.has(licensePlanIdOf(outgoingPool))) continue;
		throw new RecaseError({
			message:
				`License changes conflict with active license assignments: ` +
				`${used} assigned for ${licensePlanIdOf(outgoingPool)}, but the incoming plan drops the license. Release licenses first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
