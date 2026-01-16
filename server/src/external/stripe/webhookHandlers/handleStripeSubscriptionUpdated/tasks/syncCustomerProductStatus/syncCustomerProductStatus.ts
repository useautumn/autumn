import {
	AttachScenario,
	type CollectionMethod,
	CusProductStatus,
	cp,
	type FullCusProduct,
} from "@autumn/shared";
import {
	stripeSubscriptionToAutumnStatus,
	stripeSubscriptionToTrialEndsAtMs,
} from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { trackCustomerProductUpdate } from "../../utils/trackCustomerProductUpdate";
import { fixUnexpectedStatuses } from "./fixUnexpectedStatuses";

/**
 * Syncs customer product status, trial_ends_at, and collection_method from Stripe subscription.
 *
 * This function:
 * 1. Iterates through customer products on the stripe subscription
 * 2. Updates status to match Stripe (SKIPPING Scheduled products)
 * 3. Updates trial_ends_at and collection_method
 * 4. Sends PastDue webhook if status transitions to PastDue
 * 5. Does a cursory DB update for any customer products with unexpected statuses (safety net)
 */
export const syncCustomerProductStatus = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { db, logger, org, env } = ctx;
	const { stripeSubscription, customerProducts, fullCustomer } =
		subscriptionUpdatedContext;

	// Map Stripe status to Autumn status
	const autumnStatus = stripeSubscriptionToAutumnStatus({
		stripeStatus: stripeSubscription.status,
	});

	// Get trial_ends_at and collection_method from Stripe
	const trialEndsAt = stripeSubscriptionToTrialEndsAtMs({ stripeSubscription });
	const collectionMethod =
		stripeSubscription.collection_method as CollectionMethod;

	// ctx.logger.debug(
	// 	"[syncCustomerProductStatus] Customer products",
	// 	customerProducts.map((cp) => ({
	// 		id: cp.id,
	// 		product: cp.product.name,
	// 		status: cp.status,
	// 	})),
	// );

	// Update customer products on this subscription
	for (const customerProduct of customerProducts) {
		// Skip if not on this subscription

		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		// Build updates
		const updates: Partial<FullCusProduct> = {};

		// Update status if changed
		if (customerProduct.status !== autumnStatus) {
			updates.status = autumnStatus;
		}

		// Sync trial_ends_at (normalize null/undefined comparison)
		const currentTrialEndsAt = customerProduct.trial_ends_at ?? null;
		const newTrialEndsAt = trialEndsAt ?? null;
		if (currentTrialEndsAt !== newTrialEndsAt) {
			updates.trial_ends_at = newTrialEndsAt;
		}

		// Sync collection_method
		if (customerProduct.collection_method !== collectionMethod) {
			updates.collection_method = collectionMethod;
		}

		// Skip if nothing to update
		if (Object.keys(updates).length === 0) continue;

		logger.debug(
			`[syncCustomerProductStatus] Updating ${customerProduct.product.name}`,
			{ data: updates },
		);

		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		// Send PastDue webhook if transitioning to PastDue
		const isTransitioningToPastDue =
			updates.status === CusProductStatus.PastDue;

		if (isTransitioningToPastDue && org.config.sync_status) {
			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: fullCustomer.internal_id,
				org,
				env,
				customerId: fullCustomer.id ?? null,
				scenario: AttachScenario.PastDue,
				cusProduct: customerProduct,
			});
		}
	}

	// Safety net: fix any customer products with unexpected statuses
	await fixUnexpectedStatuses({
		ctx,
		stripeSubscription,
		fullCustomer,
		autumnStatus,
		trialEndsAt,
		collectionMethod,
	});
};
