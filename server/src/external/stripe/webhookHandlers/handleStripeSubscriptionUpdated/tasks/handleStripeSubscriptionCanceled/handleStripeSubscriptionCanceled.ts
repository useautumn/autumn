import { AttachScenario, cp, type FullCusProduct } from "@autumn/shared";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { isStripeSubscriptionCanceledEvent } from "./isStripeSubscriptionCanceledEvent";
import { scheduleDefaultProducts } from "./scheduleDefaultProducts";

/**
 * Handles external subscription cancellations (from Stripe dashboard/portal).
 *
 * This task:
 * 1. Detects if subscription was just canceled
 * 2. Skips if Autumn initiated the cancellation (via lock)
 * 3. Marks active customer products as canceled
 * 4. Schedules default products for non-add-on groups
 * 5. Sends cancel webhooks (after defaults are scheduled)
 */
export const handleStripeSubscriptionCanceled = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const {
		stripeSubscription,
		previousAttributes,
		customerProducts,
		fullCustomer,
	} = subscriptionUpdatedContext;

	// 1. Check if this is actually a cancellation event
	const { canceled, canceledAtMs, cancelsAtMs } =
		isStripeSubscriptionCanceledEvent({
			stripeSubscription,
			previousAttributes,
		});

	if (!canceled) return;

	// 2. Check lock - if Autumn initiated this cancellation, skip
	const lock = await getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});

	const hasSchedule = Boolean(stripeSubscription.schedule);

	if (lock || hasSchedule) {
		logger.info(
			`[handleStripeSubscriptionCanceled] Skipping - lock on stripe subscription found`,
		);
		return;
	}

	// PASS 1: Update cancellation status
	const allCanceledProducts: FullCusProduct[] = [];
	const canceledNonAddonProducts: FullCusProduct[] = [];

	for (const customerProduct of customerProducts) {
		const { valid: isActiveRecurringAndOnSub } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!isActiveRecurringAndOnSub) continue;

		const updates = {
			canceled_at: canceledAtMs ?? Date.now(),
			canceled: true,
			ended_at: cancelsAtMs ?? undefined,
		};

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		logger.info(
			`[handleStripeSubscriptionCanceled] Marked ${customerProduct.product.name} as canceled`,
		);

		allCanceledProducts.push(customerProduct);

		if (!customerProduct.product.is_add_on) {
			canceledNonAddonProducts.push(customerProduct);
		}
	}

	// PASS 2: Schedule default products
	let scheduledByGroup = new Map<string, FullCusProduct>();
	if (org.config.sync_status && canceledNonAddonProducts.length > 0) {
		scheduledByGroup = await scheduleDefaultProducts({
			ctx,
			subscriptionUpdatedContext,
			canceledCustomerProducts: canceledNonAddonProducts,
		});
	}

	// PASS 3: Send cancel webhooks (after defaults are scheduled)
	for (const customerProduct of allCanceledProducts) {
		const scheduledCusProduct = scheduledByGroup.get(
			customerProduct.product.group,
		);

		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
			org,
			env,
			customerId: fullCustomer.id ?? null,
			scenario: AttachScenario.Cancel,
			cusProduct: customerProduct,
			scheduledCusProduct,
		});
	}
};
