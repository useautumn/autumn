import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { listFullCustomerProductsByIds } from "../../repos/listFullCustomerProductsByIds.js";
import { collectSurplusUnusedAssignmentIds } from "./collectSurplusUnusedAssignmentIds.js";
import type { ReconcileContext } from "./types.js";

/** Unused seats beyond remaining can never rebind — expire them so their
 * contributions leave the credit pool. Bound assignments are untouched. */
export const expireUnusedAssignments = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
}) => {
	const unusedAssignments =
		await licenseAssignmentRepo.listUnusedAssignmentsByLinkIds({
			db: ctx.db,
			customerLicenseLinkIds: context.customerLicenses.map(
				(customerLicense) => customerLicense.link_id,
			),
		});
	const surplusAssignmentIds = collectSurplusUnusedAssignmentIds({
		unusedAssignments,
		customerLicenses: context.customerLicenses,
	});
	if (surplusAssignmentIds.length === 0) return;

	const endedAt = Date.now();
	const expiredSeats = await licenseAssignmentRepo.expireUnusedAssignmentsByIds({
		db: ctx.db,
		customerProductIds: surplusAssignmentIds,
		endedAt,
	});
	if (expiredSeats.length === 0) return;

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
