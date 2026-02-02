import {
	type Customer,
	type DeferredAutumnBillingPlanData,
	type FullProduct,
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

export interface CheckoutSessionV2Result {
	customer: Customer;
	products: FullProduct[];
}

export const handleCheckoutSessionMetadataV2 = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<CheckoutSessionV2Result | null> => {
	const { metadata } = checkoutContext;

	if (metadata?.type !== MetadataType.CheckoutSessionV2) return null;

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

	// // 3. Execute deferred billing plan (customer products, subscription upsert, invoice upsert)
	// await executeDeferredBillingPlanFromCheckout({
	// 	ctx,
	// 	metadata,
	// 	deferredData,
	// });

	// Delete metadata after successful execution
	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	// Return data needed for reward and customer update tasks
	return {
		customer: updatedDeferredData.billingContext.fullCustomer,
		products: updatedDeferredData.billingPlan.autumn.insertCustomerProducts.map(
			(cp) => cp.product,
		),
	};
};
