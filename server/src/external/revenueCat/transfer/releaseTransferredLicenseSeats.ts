import {
	ACTIVE_STATUSES,
	customerLicenses,
	customerProducts,
	type FullCusProduct,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseRemainingChanges } from "@/internal/billing/v2/actions/releaseLicense/compute/computeCustomerLicenseRemainingChanges";
import { computeEntityCustomerProductUpdates } from "@/internal/billing/v2/actions/releaseLicense/compute/computeEntityCustomerProductUpdates";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";

/** Entities stay with the source: seats on a moving pool are released, then every leftover seat row is expired so the destination never reuses them. */
export const releaseTransferredLicenseSeats = async ({
	ctx,
	sourceCustomerId,
	sourceInternalId,
	cusProductIds,
}: {
	ctx: AutumnContext;
	sourceCustomerId: string;
	sourceInternalId: string;
	cusProductIds: string[];
}) => {
	const pools = await ctx.db
		.select({ linkId: customerLicenses.link_id })
		.from(customerLicenses)
		.where(inArray(customerLicenses.parent_customer_product_id, cusProductIds));
	if (pools.length === 0) return;

	const linkIds = pools.map((pool) => pool.linkId);
	const assignments = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, sourceInternalId),
				inArray(customerProducts.customer_license_link_id, linkIds),
				isNotNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, ACTIVE_STATUSES),
			),
		);

	if (assignments.length > 0)
		await releaseAssignments({ ctx, sourceCustomerId, assignments });

	const unused = await licenseAssignmentRepo.listUnusedAssignmentsByLinkIds({
		db: ctx.db,
		customerLicenseLinkIds: linkIds,
	});
	await licenseAssignmentRepo.expireUnusedAssignmentsByIds({
		db: ctx.db,
		customerProductIds: unused.map((assignment) => assignment.id),
		endedAt: Date.now(),
	});
};

const releaseAssignments = async ({
	ctx,
	sourceCustomerId,
	assignments,
}: {
	ctx: AutumnContext;
	sourceCustomerId: string;
	assignments: (typeof customerProducts.$inferSelect)[];
}) => {
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: sourceCustomerId,
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
		},
	});
};
