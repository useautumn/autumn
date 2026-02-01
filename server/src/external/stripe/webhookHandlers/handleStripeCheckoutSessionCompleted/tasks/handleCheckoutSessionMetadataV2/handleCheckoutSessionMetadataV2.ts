import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import { modifyStripeSubscriptionFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/modifyStripeSubscriptionFromCheckout";
import { updateBillingPlanFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateBillingPlanFromCheckout";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const handleCheckoutSessionMetadataV2 = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}) => {
	const { metadata } = checkoutContext;

	if (metadata?.type !== MetadataType.CheckoutSessionV2) return;

	ctx.logger.info(
		`[checkout.completed] Handling checkout session metadata V2: ${metadata.id}`,
	);

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;

	// 1. Modify Stripe subscription
	await modifyStripeSubscriptionFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

	// // 2. Update billing plan with checkout data (upsertSubscription, upsertInvoice)
	const updatedDeferredData = await updateBillingPlanFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

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
	});

	// // 3. Execute deferred billing plan (customer products, subscription upsert, invoice upsert)
	// await executeDeferredBillingPlanFromCheckout({
	// 	ctx,
	// 	metadata,
	// 	deferredData,
	// });

	// Delete metadata after successful execution
	await MetadataService.delete({ db: ctx.db, id: metadata.id });
};
