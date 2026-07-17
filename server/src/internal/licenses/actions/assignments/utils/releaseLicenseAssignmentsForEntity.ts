import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeCustomerLicenseRemainingChanges } from "@/internal/billing/v2/actions/releaseLicense/compute/computeCustomerLicenseRemainingChanges.js";
import { computeEntityCustomerProductUpdates } from "@/internal/billing/v2/actions/releaseLicense/compute/computeEntityCustomerProductUpdates.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { CusService } from "@/internal/customers/CusService.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";

/** Releases every active assignment held by an entity back to its pool
 * before the entity row goes — the seats stay reusable. */
export const releaseLicenseAssignmentsForEntity = async ({
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

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: customer?.id ?? assignments[0].internal_customer_id,
			insertCustomerProducts: [],
			updateCustomerProducts: computeEntityCustomerProductUpdates({
				assignments: assignments as unknown as FullCusProduct[],
				releasedAt: Date.now(),
			}),
			customerLicenseUpdates: computeCustomerLicenseRemainingChanges({
				customerLicenseLinkIds: assignments.flatMap((assignment) =>
					assignment.customer_license_link_id
						? [assignment.customer_license_link_id]
						: [],
				),
			}),
			pooledBalanceOps: assignments.map((assignment) => ({
				op: "remove_source",
				internalCustomerId: assignment.internal_customer_id,
				sourceCustomerProductId: assignment.id,
				effectiveAt: null,
			})),
		},
	});
};
