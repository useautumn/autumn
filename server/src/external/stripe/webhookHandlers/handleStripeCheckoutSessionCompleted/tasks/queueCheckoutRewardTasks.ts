import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { JobName } from "@/queue/JobName";
import { addTaskToQueue } from "@/queue/queueUtils";
import type { CheckoutSessionCompletedContext } from "../setupCheckoutSessionCompletedContext";

/**
 * Queues reward jobs for each product in the billing plan.
 * Rewards are triggered after checkout completion to send webhooks, etc.
 */
export const queueCheckoutRewardTasks = async ({
	ctx,
	checkoutContext,
	billingPlanData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	billingPlanData: DeferredAutumnBillingPlanData;
}) => {
	const { org, env } = ctx;
	const { stripeSubscription } = checkoutContext;
	const { billingContext, billingPlan } = billingPlanData;
	const { fullCustomer } = billingContext;

	const insertCustomerProducts = billingPlan.autumn?.insertCustomerProducts;
	if (!insertCustomerProducts || insertCustomerProducts.length === 0) return;

	for (const customerProduct of insertCustomerProducts) {
		ctx.logger.info(
			`[checkout.completed] Queueing checkout reward for product ${customerProduct.product.id}`,
		);

		await addTaskToQueue({
			jobName: JobName.TriggerCheckoutReward,
			payload: {
				// For createWorkerContext
				orgId: org.id,
				env,
				customerId: fullCustomer.id,

				// For triggerCheckoutReward
				customer: fullCustomer,
				product: customerProduct.product,
				subId: stripeSubscription?.id,
			},
		});
	}
};
