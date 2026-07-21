import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
	notNullish,
} from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import { createStripeScheduleFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionEnabledImmediately/createStripeScheduleFromCheckout";
import { modifyStripeSubscriptionFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/modifyStripeSubscriptionFromCheckout";
import { syncSubscriptionItemMetadataFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/syncSubscriptionItemMetadataFromCheckout";
import { updateBillingPlanFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateBillingPlanFromCheckout";
import { withClaimedCheckoutSessionMetadata } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/withClaimedCheckoutSessionMetadata";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { persistDeferredCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/utils/persistDeferredCreateSchedule";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { withBillingLock } from "@/internal/billing/v2/utils/billingLock/withBillingLock";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { workflows } from "@/queue/workflows";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const handleCheckoutSessionMetadataV2 = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<void> => {
	const { metadata } = checkoutContext;

	if (metadata?.type !== MetadataType.CheckoutSessionV2) return;

	ctx.logger.info(
		`[checkout.completed] Handling checkout session metadata V2: ${metadata.id}`,
	);

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;
	const fullCustomer = deferredData?.billingContext?.fullCustomer;

	await withBillingLock({
		// Route locks key on whichever identifier the API caller passed — hold both.
		lockKeys: [fullCustomer?.id, fullCustomer?.internal_id]
			.filter(notNullish)
			.map((customerId) =>
				buildBillingLockKey({ orgId: ctx.org.id, env: ctx.env, customerId }),
			),
		fn: () =>
			withClaimedCheckoutSessionMetadata({
				ctx,
				checkoutContext,
				metadata,
				execute: () =>
					executeCheckoutSessionMetadataV2({
						ctx,
						checkoutContext,
						metadata,
					}),
			}),
	});
};

const executeCheckoutSessionMetadataV2 = async ({
	ctx,
	checkoutContext,
	metadata,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	metadata: NonNullable<CheckoutSessionCompletedContext["metadata"]>;
}): Promise<void> => {
	const deferredData = metadata.data as DeferredAutumnBillingPlanData;

	// 1. Sync Autumn metadata onto subscription items created by checkout
	await syncSubscriptionItemMetadataFromCheckout({
		ctx,
		checkoutContext,
	});

	// 2. Update billing plan with checkout data (upsertSubscription, upsertInvoice)
	const updatedDeferredData = await updateBillingPlanFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

	// 3. Modify Stripe subscription to include other interval prices / 0 quantity prices
	await modifyStripeSubscriptionFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	const stripeScheduleId = await createStripeScheduleFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	if (stripeScheduleId) {
		addStripeSubscriptionScheduleIdToBillingPlan({
			autumnBillingPlan: updatedDeferredData.billingPlan.autumn,
			stripeBillingPlan: updatedDeferredData.billingPlan.stripe,
			stripeSubscriptionScheduleId: stripeScheduleId,
		});
	}

	addToExtraLogs({
		ctx,
		extras: {
			originalRequestId: deferredData.requestId,
		},
	});

	logAutumnBillingPlan({
		ctx,
		plan: updatedDeferredData.billingPlan.autumn,
		billingContext: updatedDeferredData.billingContext,
	});

	// Execute autumn billing plan (includes customer products, upsertSubscription, upsertInvoice)
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: updatedDeferredData.billingPlan.autumn,
		stripeInvoice: checkoutContext.stripeInvoice,
	});

	await persistDeferredCreateSchedule({
		ctx,
		billingContext: updatedDeferredData.billingContext,
		billingPlan: updatedDeferredData.billingPlan,
	});

	// Queue customer.products.updated webhook (mirrors executeBillingPlan)
	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan: updatedDeferredData.billingPlan.autumn,
		billingContext: updatedDeferredData.billingContext,
	});

	// Fire-and-forget billing.updated webhook (mirrors executeBillingPlan)
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: updatedDeferredData.billingPlan.autumn,
		originalFullCustomer: updatedDeferredData.billingContext.fullCustomer,
	});

	// Delete metadata after successful execution
	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	const newCustomerProducts =
		updatedDeferredData.billingPlan.autumn.insertCustomerProducts;

	const customerId = ctx.fullCustomer?.id ?? "";

	for (const product of newCustomerProducts) {
		await workflows.triggerGrantCheckoutReward({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			productId: product.product.id,
			stripeSubscriptionId: checkoutContext.stripeSubscription?.id,
		});
	}
};
