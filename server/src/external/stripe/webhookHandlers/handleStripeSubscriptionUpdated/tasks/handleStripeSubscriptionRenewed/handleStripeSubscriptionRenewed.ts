import {
	AttachScenario,
	cp,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
} from "@autumn/shared";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	trackCustomerProductDeletion,
	trackCustomerProductUpdate,
} from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { isStripeSubscriptionRenewedEvent } from "./isStripeSubscriptionRenewedEvent";

/**
 * Handles subscription renewals (un-cancellations) from Stripe.
 *
 * This task:
 * 1. Detects if subscription was renewed (un-canceled)
 * 2. Skips if Autumn initiated or has schedule
 * 3. Clears cancellation fields on active customer products
 * 4. Deletes scheduled products for recurring main products (since they're staying)
 * 5. Sends renewal webhooks
 */
export const handleStripeSubscriptionRenewed = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { db, org, env, logger } = ctx;
	const {
		stripeSubscription,
		previousAttributes,
		customerProducts,
		fullCustomer,
	} = subscriptionUpdatedContext;

	// 1. Check if this is actually a renewal event
	const { renewed } = isStripeSubscriptionRenewedEvent({
		stripeSubscription,
		previousAttributes,
	});

	if (!renewed) return;

	// 2. Check lock or schedule - skip if Autumn initiated or schedule exists
	const lock = await getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});
	const hasSchedule = Boolean(stripeSubscription.schedule);

	if (lock || hasSchedule) {
		logger.info(
			`[handleStripeSubscriptionRenewed] Skipping - ${lock ? "lock found" : "has schedule"}`,
		);
		return;
	}

	// PASS 1: Update customer products and handle scheduled products
	for (const customerProduct of customerProducts) {
		// Skip if not active or not on this subscription

		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		// Clear cancellation fields
		const updates = {
			canceled_at: null,
			canceled: false,
			ended_at: null,
		};

		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		logger.info(
			`[handleStripeSubscriptionRenewed] Cleared cancellation for ${customerProduct.product.name}`,
		);

		// For recurring main products, delete any scheduled product in the same group
		const { valid: isRecurringAndMain } = cp(customerProduct)
			.recurring()
			.main();

		if (!org.config.sync_status) continue; // legacy

		let deletedScheduledProduct: FullCusProduct | undefined;
		if (isRecurringAndMain) {
			const scheduledProduct = findMainScheduledCustomerProductByGroup({
				fullCustomer,
				productGroup: customerProduct.product.group,
				internalEntityId: customerProduct.internal_entity_id ?? undefined,
			});

			if (scheduledProduct) {
				await CusProductService.delete({
					db,
					cusProductId: scheduledProduct.id,
				});

				deletedScheduledProduct = scheduledProduct;

				logger.info(
					`[handleStripeSubscriptionRenewed] Deleted scheduled ${scheduledProduct.product.name}`,
				);

				trackCustomerProductDeletion({
					eventContext: subscriptionUpdatedContext,
					customerProduct: scheduledProduct,
				});
			}
		}

		// Send webhook
		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
			org,
			env,
			customerId: fullCustomer.id ?? null,
			scenario: AttachScenario.Renew,
			cusProduct: customerProduct,
			deletedCusProduct: deletedScheduledProduct,
		});
	}
};
