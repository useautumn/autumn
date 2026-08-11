/**
 * Mirrors the Stripe handlers' `emitBillingChangeWebhook` step for RevenueCat
 * lifecycle changes: builds a minimal AutumnBillingPlan and fires `billing.updated`.
 */

import type {
	CustomerProductUpdate,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";

/** Snapshot BEFORE a lifecycle action — actions replace `customer_products` in place. */
export const snapshotFullCustomer = (
	fullCustomer: FullCustomer,
): FullCustomer => ({
	...fullCustomer,
	customer_products: [...fullCustomer.customer_products],
});

export const emitRevenueCatBillingUpdated = ({
	ctx,
	originalFullCustomer,
	updateCustomerProducts = [],
	insertCustomerProducts = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	updateCustomerProducts?: CustomerProductUpdate[];
	insertCustomerProducts?: FullCusProduct[];
}): void => {
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: {
			customerId: originalFullCustomer.id ?? originalFullCustomer.internal_id,
			insertCustomerProducts,
			updateCustomerProducts,
		},
		originalFullCustomer,
	});
};
