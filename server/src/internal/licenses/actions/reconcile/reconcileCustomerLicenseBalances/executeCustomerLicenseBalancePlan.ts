import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCustomerLicenseBalances } from "../../../repos/customerLicenseRepo/updateCustomerLicenseBalances.js";
import type { ReconcileContext } from "../types.js";
import type { CustomerLicenseBalancePlan } from "./computeCustomerLicenseBalancePlan.js";

/** Applies all balance updates in one batched UPDATE, then patches the
 * context rows so the returned state mirrors the database. */
export const executeCustomerLicenseBalancePlan = async ({
	ctx,
	context,
	plan,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
	plan: CustomerLicenseBalancePlan;
}) => {
	await updateCustomerLicenseBalances({
		db: ctx.db,
		rows: plan.balanceUpdates.map(({ customerLicenseId, updates }) => ({
			id: customerLicenseId,
			granted: updates.granted,
			remaining: updates.remaining,
			plan_license_id: updates.plan_license_id,
		})),
	});

	const updatesById = new Map(
		plan.balanceUpdates.map((update) => [
			update.customerLicenseId,
			update.updates,
		]),
	);
	for (const customerLicense of context.customerLicenses) {
		Object.assign(customerLicense, updatesById.get(customerLicense.id));
	}
};
