import {
	customerProductEligibleForDefaultProduct,
	enrichFullCustomerWithEntity,
	type FullCusProduct,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { scheduleDefaultProduct } from "@/internal/customers/cusProducts/cusProductUtils/scheduleDefaultProduct";
import { ProductService } from "@/internal/products/ProductService";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Schedules default products for customer product groups that are being canceled.
 * Returns a map of product group -> scheduled customer product.
 */
export const scheduleDefaultProducts = async ({
	ctx,
	subscriptionUpdatedContext,
	canceledCustomerProducts,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	canceledCustomerProducts: FullCusProduct[];
}): Promise<Map<string, FullCusProduct>> => {
	const { db, org, env } = ctx;
	const { stripeSubscription, fullCustomer } = subscriptionUpdatedContext;

	const scheduledByGroup = new Map<string, FullCusProduct>();

	// Fetch default products upfront (optimization)
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const scheduleAtMs = getLatestPeriodEnd({ sub: stripeSubscription }) * 1000;

	// Schedule default for each canceled non-entity product group
	for (const canceledProduct of canceledCustomerProducts) {
		const eligibleForDefaultProduct = customerProductEligibleForDefaultProduct({
			ctx,
			customerProduct: canceledProduct,
		});
		if (!eligibleForDefaultProduct) continue;

		const scheduledCusProduct = await scheduleDefaultProduct({
			ctx,
			productGroup: canceledProduct.product.group,
			fullCustomer: enrichFullCustomerWithEntity({
				fullCustomer,
				internalEntityId: canceledProduct.internal_entity_id ?? null,
			}),
			scheduleAtMs,
			defaultProducts,
		});

		if (scheduledCusProduct) {
			scheduledByGroup.set(canceledProduct.product.group, scheduledCusProduct);
		}
	}

	return scheduledByGroup;
};
