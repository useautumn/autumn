import {
	ACTIVE_STATUSES,
	customerLicenses,
	customerProducts,
	type FullCusProduct,
} from "@autumn/shared";
import { and, inArray, isNotNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseRemainingChanges } from "@/internal/billing/v2/actions/releaseLicense/compute/computeCustomerLicenseRemainingChanges";
import { computeEntityCustomerProductUpdates } from "@/internal/billing/v2/actions/releaseLicense/compute/computeEntityCustomerProductUpdates";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";

/** Entities stay with the source, so seats they hold on a moving pool go back to it before the pool moves. */
export const releaseTransferredLicenseSeats = async ({
	ctx,
	sourceCustomerId,
	cusProductIds,
}: {
	ctx: AutumnContext;
	sourceCustomerId: string;
	cusProductIds: string[];
}) => {
	const pools = await ctx.db
		.select({ linkId: customerLicenses.link_id })
		.from(customerLicenses)
		.where(inArray(customerLicenses.parent_customer_product_id, cusProductIds));
	if (pools.length === 0) return;

	const assignments = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				inArray(
					customerProducts.customer_license_link_id,
					pools.map((pool) => pool.linkId),
				),
				isNotNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, ACTIVE_STATUSES),
			),
		);
	if (assignments.length === 0) return;

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
