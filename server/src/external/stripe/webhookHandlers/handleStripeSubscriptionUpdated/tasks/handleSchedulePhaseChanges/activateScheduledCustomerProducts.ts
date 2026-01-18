import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductFree,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { trackCustomerProductUpdate } from "../../utils/trackCustomerProductUpdate";
import { PHASE_TOLERANCE_MS } from "./schedulePhaseConstants";

/**
 * Checks if a scheduled customer product should be activated.
 * Uses tolerance to handle timing differences between Stripe and webhook arrival.
 */
const shouldActivateScheduledProduct = ({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs: number;
}): boolean => {
	if (customerProduct.status !== CusProductStatus.Scheduled) return false;
	// Activate if starts_at is within tolerance of now
	return customerProduct.starts_at <= nowMs + PHASE_TOLERANCE_MS;
};

/**
 * Activates scheduled customer products that should now be active.
 * Tracks updates via subscriptionUpdatedContext.
 */
export const activateScheduledCustomerProducts = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { db, logger, org, env } = ctx;
	const { stripeSubscription, customerProducts, nowMs, fullCustomer } =
		subscriptionUpdatedContext;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	for (const customerProduct of customerProducts) {
		if (!shouldActivateScheduledProduct({ customerProduct, nowMs })) continue;

		// If product is free, or on the stripe schedule / subscription, then we activate it
		const isFree = isCustomerProductFree(customerProduct);
		const isOnStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});
		const isOnStripeSubscriptionSchedule =
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule?.id,
			});

		const canActivate =
			isFree || isOnStripeSubscription || isOnStripeSubscriptionSchedule;
		if (!canActivate) continue;

		logger.info(
			`[handleSchedulePhaseChanges] ✅ activating: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const updates = {
			status: CusProductStatus.Active,
			subscription_ids: isFree ? [] : [stripeSubscription.id],
			scheduled_ids: isFree
				? []
				: isOnStripeSubscriptionSchedule
					? [stripeSubscriptionSchedule.id]
					: [],
		};

		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates,
		});

		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: customerProduct.internal_customer_id,
			org,
			env,
			customerId: fullCustomer.id || "",
			scenario: AttachScenario.New,
			cusProduct: customerProduct,
		});

		trackCustomerProductUpdate({
			subscriptionUpdatedContext,
			customerProduct,
			updates,
		});
	}
};
