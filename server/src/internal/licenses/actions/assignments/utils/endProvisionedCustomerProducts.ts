import { RELEVANT_STATUSES } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";

/**
 * Tears down provisioned assignment products: subscription-backed assignments
 * cancel through billing so Stripe stops charging; free provisions expire directly.
 */
export const endProvisionedCustomerProducts = async ({
	ctx,
	customerId,
	assignmentIds,
	endedAt,
}: {
	ctx: AutumnContext;
	customerId: string;
	assignmentIds: string[];
	endedAt: number;
}) => {
	for (const customerProductId of assignmentIds) {
		const customerProduct = await CusProductService.getFull({
			db: ctx.db,
			id: customerProductId,
			inStatuses: RELEVANT_STATUSES,
		});
		if (!customerProduct) continue;

		if ((customerProduct.subscription_ids?.length ?? 0) > 0) {
			await billingActions.updateSubscription({
				ctx,
				params: {
					customer_id: customerId,
					customer_product_id: customerProductId,
					cancel_action: "cancel_immediately",
					proration_behavior: "none",
					redirect_mode: "if_required",
				},
				options: { skipAutumnCheckout: true },
			});
			continue;
		}

		await licenseAssignmentRepo.expireAssignmentsByIds({
			db: ctx.db,
			assignmentIds: [customerProductId],
			endedAt,
		});
	}
};
