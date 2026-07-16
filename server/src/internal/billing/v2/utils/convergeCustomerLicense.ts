import type { FullCustomerLicense, FullPlanLicense } from "@autumn/shared";

/**
 * The pool after converging onto a definition and/or absolute paid count —
 * in-memory twin of customerLicenseRepo.setPaidQuantity/repointDefinition.
 * Usage is untouched; remaining floors at zero.
 */
export const convergeCustomerLicense = ({
	customerLicense,
	planLicense,
	paidQuantity,
}: {
	customerLicense: FullCustomerLicense;
	/** New effective definition; omitted keeps the current one. */
	planLicense?: FullPlanLicense;
	/** Absolute paid count; omitted keeps the current paid seats. */
	paidQuantity?: number;
}): FullCustomerLicense => {
	const included = planLicense
		? planLicense.included
		: customerLicense.granted - customerLicense.paid_quantity;
	const paid = paidQuantity ?? customerLicense.paid_quantity;
	const used = customerLicense.granted - customerLicense.remaining;
	const granted = included + paid;

	return {
		...customerLicense,
		...(planLicense ? { planLicense, plan_license_id: planLicense.id } : {}),
		granted,
		remaining: Math.max(0, granted - used),
		paid_quantity: paid,
	};
};
