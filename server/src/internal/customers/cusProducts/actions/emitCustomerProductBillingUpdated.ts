/**
 * Mirrors the Stripe handlers' `emitBillingChangeWebhook` step for lifecycle
 * actions: builds a minimal AutumnBillingPlan and fires `billing.updated`.
 */

import type {
	CustomerProductUpdate,
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";

/** Accepts the wider update shape lifecycle actions produce, narrowed once here. */
type LifecycleCustomerProductUpdate = {
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
};

export const emitCustomerProductBillingUpdated = ({
	ctx,
	originalFullCustomer,
	updateCustomerProducts = [],
	insertCustomerProducts = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	updateCustomerProducts?: LifecycleCustomerProductUpdate[];
	insertCustomerProducts?: FullCusProduct[];
}): void => {
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: {
			customerId: originalFullCustomer.id ?? originalFullCustomer.internal_id,
			insertCustomerProducts,
			updateCustomerProducts: updateCustomerProducts.map(
				({ customerProduct, updates }) => ({
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				}),
			),
		},
		originalFullCustomer,
	});
};
