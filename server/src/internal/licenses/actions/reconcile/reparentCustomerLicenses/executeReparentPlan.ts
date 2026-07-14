import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "../../../repos/customerLicenseRepo.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";
import type { ReconcileContext } from "../types.js";
import {
	type ReparentPlan,
	reparentOpToUpdates,
} from "./computeReparentPlan.js";

/**
 * Applies each reparent op — delete the fresh row, move the stranded row
 * into its place (delete first: the unique (parent, license) index) — then
 * patches the context to mirror the database. The closing sweep ends every
 * seat anchored to no surviving customer license (unadopted stranded,
 * dangling, unstamped) in one set-based UPDATE.
 */
export const executeReparentPlan = async ({
	ctx,
	context,
	plan,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
	plan: ReparentPlan;
}) => {
	for (const op of plan.reparentOps) {
		await customerLicenseRepo.deleteByIds({
			db: ctx.db,
			ids: [op.replacedFreshCustomerLicense.id],
		});
		await customerLicenseRepo.update({
			db: ctx.db,
			customerLicenseId: op.strandedCustomerLicense.id,
			updates: reparentOpToUpdates(op),
		});
	}

	const replacedIds = new Set(
		plan.reparentOps.map((op) => op.replacedFreshCustomerLicense.id),
	);
	context.customerLicenses = [
		...context.customerLicenses.filter(
			(customerLicense) => !replacedIds.has(customerLicense.id),
		),
		...plan.reparentOps.map((op) => ({
			...op.strandedCustomerLicense,
			...reparentOpToUpdates(op),
			planLicense: op.replacedFreshCustomerLicense.planLicense,
		})),
	];

	await licenseAssignmentRepo.expireOrphanAssignments({
		db: ctx.db,
		internalCustomerId: context.fullCustomer.internal_id,
		validCustomerLicenseLinkIds: context.customerLicenses.map(
			(customerLicense) => customerLicense.link_id,
		),
		endedAt: Date.now(),
	});
};
