import type { DbCustomerLicense } from "@autumn/shared";
import type { ReconcileContext } from "../types.js";

export type CustomerLicenseBalanceUpdate = {
	customerLicenseId: string;
	updates: Pick<DbCustomerLicense, "granted" | "remaining" | "plan_license_id">;
};

export type CustomerLicenseBalancePlan = {
	balanceUpdates: CustomerLicenseBalanceUpdate[];
};

export const computeCustomerLicenseBalancePlan = ({
	context,
}: {
	context: ReconcileContext;
}): CustomerLicenseBalancePlan => {
	const balanceUpdates = context.customerLicenses.flatMap((customerLicense) => {
		const { planLicense } = customerLicense;
		if (!planLicense) return [];

		const granted = planLicense.included + customerLicense.paid_quantity;
		const remaining =
			granted -
			(context.seatCountByCustomerLicenseId.get(customerLicense.id) ?? 0);

		const drifted =
			customerLicense.granted !== granted ||
			customerLicense.remaining !== remaining ||
			customerLicense.plan_license_id !== planLicense.id;
		if (!drifted) return [];

		return [
			{
				customerLicenseId: customerLicense.id,
				updates: { granted, remaining, plan_license_id: planLicense.id },
			},
		];
	});
	return { balanceUpdates };
};
