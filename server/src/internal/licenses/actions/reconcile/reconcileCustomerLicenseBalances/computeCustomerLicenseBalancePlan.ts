import type { DbCustomerLicense } from "@autumn/shared";
import type { ReconcileContext } from "../types.js";

export type CustomerLicenseBalanceUpdate = {
	customerLicenseId: string;
	updates: Pick<DbCustomerLicense, "granted" | "remaining" | "plan_license_id">;
};

export type CustomerLicenseBalancePlan = {
	balanceUpdates: CustomerLicenseBalanceUpdate[];
};

/**
 * Pure convergence of the derived columns on each live customer license:
 * granted from its effective plan license, remaining from granted minus live
 * seats, plan_license_id re-resolved (the column is output, never input).
 * Rows already true — or with no license (link removed) — get no update.
 */
export const computeCustomerLicenseBalancePlan = ({
	context,
}: {
	context: ReconcileContext;
}): CustomerLicenseBalancePlan => {
	const balanceUpdates = context.customerLicenses.flatMap((customerLicense) => {
		const { planLicense } = customerLicense;
		if (!planLicense) return [];

		// granted = included + paid; paid_quantity is billing-owned input here.
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
