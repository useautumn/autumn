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

	// 1. Update billing plan with checkout data (upsertSubscription, upsertInvoice)
	const updatedDeferredData = await updateBillingPlanFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

	// 2. Modify Stripe subscription to include other interval prices / 0 quantity prices
	await modifyStripeSubscriptionFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
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
