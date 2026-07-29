import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import type { ReconcileContext } from "./types.js";

/** Over-allocated pools (remaining < 0) can never rebind their released
 * spare seat rows — expire the spares so they don't linger as reusable. */
export const expireUnusedAssignments = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
}) => {
	const overAllocatedLinkIds = context.customerLicenses
		.filter((customerLicense) => customerLicense.remaining < 0)
		.map((customerLicense) => customerLicense.link_id);
	if (overAllocatedLinkIds.length === 0) return;

	await licenseAssignmentRepo.expireUnusedAssignmentsByLinkIds({
		db: ctx.db,
		customerLicenseLinkIds: overAllocatedLinkIds,
		endedAt: Date.now(),
	});
};
