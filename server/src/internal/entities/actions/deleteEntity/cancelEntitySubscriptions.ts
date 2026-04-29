import {
	CusProductStatus,
	type Entity,
	type FullCustomer,
	isCustomerProductPaidRecurring,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const cancelSubsForEntity = async ({
	ctx,
	fullCustomer,
	entity,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entity: Entity;
}) => {
	const customerId = fullCustomer.id || fullCustomer.internal_id;

	for (const customerProduct of fullCustomer.customer_products) {
		if (customerProduct.internal_entity_id !== entity.internal_id) continue;

		if (customerProduct.status === CusProductStatus.Scheduled) {
			await CusProductService.delete({
				ctx,
				cusProductId: customerProduct.id,
			});
			continue;
		}

		if (!isCustomerProductPaidRecurring(customerProduct)) continue;
		if (
			customerProduct.status !== CusProductStatus.Active &&
			customerProduct.status !== CusProductStatus.PastDue
		)
			continue;

		await billingActions.updateSubscription({
			ctx,
			params: {
				customer_id: customerId,
				customer_product_id: customerProduct.id,
				entity_id: entity.id ?? entity.internal_id,
				cancel_action: "cancel_immediately",
				proration_behavior: "none",
				redirect_mode: "if_required",
			},

			options: {
				skipAutumnCheckout: true,
			},
		});
	}
};
