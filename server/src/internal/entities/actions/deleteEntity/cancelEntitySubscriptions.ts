import {
	CusProductStatus,
	type Entity,
	type FullCustomer,
	isCustomerProductPaidRecurring,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { releaseLicenseAssignmentsForEntity } from "@/internal/licenses/actions/assignments/utils/releaseLicenseAssignmentsForEntity.js";

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

	// Provisioned license products are free (skipped by the paid-recurring loop
	// below); release their seats back to the pool before the entity row goes.
	await releaseLicenseAssignmentsForEntity({
		ctx,
		internalEntityId: entity.internal_id,
	});

	const entityProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.internal_entity_id === entity.internal_id,
	);
	const scheduledProducts = entityProducts.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Scheduled,
	);
	if (scheduledProducts.length > 0) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId,
				insertCustomerProducts: [],
				deleteCustomerProducts: scheduledProducts,
			},
		});
	}

	for (const customerProduct of entityProducts) {
		if (customerProduct.status === CusProductStatus.Scheduled) continue;

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
