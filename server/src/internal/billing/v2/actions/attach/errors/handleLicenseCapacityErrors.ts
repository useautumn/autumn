import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	customerLicenseToUsage,
	ErrCode,
	type FullCustomerLicense,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

/** Immediate transitions may not shrink a pool below its active assignments —
 * neither via a reduced successor (remaining < 0) nor by dropping the pool
 * entirely (granted 0 births no successor). */
export const handleLicenseCapacityErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { attachProduct, currentCustomerProduct } = billingContext;
	if (
		!currentCustomerProduct &&
		isFreeProduct({ prices: attachProduct.prices })
	) {
		const hasPaidLicense = (attachProduct.licenses ?? []).some(
			(planLicense) => !isFreeProduct({ product: planLicense.product }),
		);
		const purchasesPaidLicense = (
			autumnBillingPlan.insertCustomerProducts ?? []
		).some((customerProduct) =>
			(customerProduct.customer_licenses ?? []).some(
				(customerLicense) =>
					customerLicense.paid_quantity > 0 &&
					customerLicense.planLicense !== null &&
					!isFreeProduct({
						product: customerLicense.planLicense.product,
					}),
			),
		);

		if (hasPaidLicense && !purchasesPaidLicense) {
			throw new RecaseError({
				message:
					"The first attach of a license-backed paid plan must request at least one license quantity above its included quantity.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	for (const transition of autumnBillingPlan.customerLicenseTransitions ?? []) {
		if (transition.updates.remaining >= 0) continue;
		const used = transition.updates.granted - transition.updates.remaining;
		throw new RecaseError({
			message:
				`License changes conflict with active license assignments: ` +
				`${used} assigned, but the incoming plan grants ${transition.updates.granted}. Release licenses first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const { planTiming } = billingContext;
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
