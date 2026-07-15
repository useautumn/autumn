import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { CusService } from "@/internal/customers/CusService.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";

/** Ends every active assignment held by an entity before the entity row goes.
 * The ends and slot releases ride the shared plan, so the license lifecycle
 * (converge + cache) runs inside the executor. */
export const endLicenseAssignmentsForEntity = async ({
	ctx,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalEntityId: string;
}) => {
	const assignments =
		await licenseAssignmentRepo.listActiveAssignmentsByInternalEntityId({
			db: ctx.db,
			internalEntityId,
		});
	if (assignments.length === 0) return;

	const customer = await CusService.getByInternalId({
		db: ctx.db,
		internalId: assignments[0].internal_customer_id,
		errorIfNotFound: false,
	});

	const endedAt = Date.now();
	const endAssignments = assignments.map((assignment) => ({
		customerProduct: assignment as unknown as FullCusProduct,
		updates: { status: CusProductStatus.Expired, ended_at: endedAt },
	}));
	const customerLicenseUpdates = assignments.flatMap((assignment) =>
		assignment.customer_license_link_id
			? [
					{
						customerLicenseLinkId: assignment.customer_license_link_id,
						remainingChange: 1,
					},
				]
			: [],
	);

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: customer?.id ?? assignments[0].internal_customer_id,
			insertCustomerProducts: [],
			updateCustomerProducts: endAssignments,
			customerLicenseUpdates,
		},
	});
};
