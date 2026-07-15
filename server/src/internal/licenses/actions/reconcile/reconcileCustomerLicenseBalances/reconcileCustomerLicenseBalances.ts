import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ReconcileContext } from "../types.js";
import { computeCustomerLicenseBalancePlan } from "./computeCustomerLicenseBalancePlan.js";
import { executeCustomerLicenseBalancePlan } from "./executeCustomerLicenseBalancePlan.js";

/**
 * Numbers convergence for the customer's live rows — granted from each row's
 * own effective license, remaining from live seat counts. No catalog reads.
 * Compute is pure; execute writes and patches the context.
 */
export const reconcileCustomerLicenseBalances = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
}) => {
	const plan = computeCustomerLicenseBalancePlan({ context });
	await executeCustomerLicenseBalancePlan({ ctx, context, plan });

	// Dead-parent rows sweep last, so adopted rows (now live-parented) survive.
	// await customerLicenseRepo.deleteByParentIdsExcept({
	// 	db: ctx.db,
	// 	internalCustomerId: context.fullCustomer.internal_id,
	// 	keepParentCustomerProductIds: context.parentCustomerProducts.map(
	// 		(parent) => parent.id,
	// 	),
	// });
};
