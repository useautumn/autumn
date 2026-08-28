import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { listFullCustomerProductsByIds } from "../../repos/listFullCustomerProductsByIds.js";
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

	const endedAt = Date.now();
	const expiredSeats =
		await licenseAssignmentRepo.expireUnusedAssignmentsByLinkIds({
			db: ctx.db,
			customerLicenseLinkIds: overAllocatedLinkIds,
			endedAt,
		});
	if (expiredSeats.length === 0) return;

	// Unassigned seats that are expired (eg, over-allocated pools) are outgoing
	const outgoingCustomerProducts = await listFullCustomerProductsByIds({
		db: ctx.db,
		customerProductIds: expiredSeats.map((seat) => seat.id),
	});
	await applyPooledBalanceCustomerProductTransitions({
		ctx,
		fullCustomer: context.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts: [],
		now: endedAt,
	});
};
