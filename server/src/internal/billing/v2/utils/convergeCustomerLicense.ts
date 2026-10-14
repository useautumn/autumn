import type { FullCustomerLicense, FullPlanLicense } from "@autumn/shared";

export const convergeCustomerLicense = ({
	customerLicense,
	planLicense,
	paidQuantity,
}: {
	customerLicense: FullCustomerLicense;
	planLicense?: FullPlanLicense;
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
