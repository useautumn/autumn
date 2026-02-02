import type { Customer, FullProduct } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { JobName } from "@/queue/JobName";
import { addTaskToQueue } from "@/queue/queueUtils";

export interface CheckoutRewardData {
	customer: Customer;
	products: FullProduct[];
	stripeSubscriptionId?: string;
}

/**
 * Queues reward jobs for each product after checkout completion.
 * Rewards trigger webhooks, referral rewards, etc.
 */
export const queueCheckoutRewardTasks = async ({
	ctx,
	rewardData,
}: {
	ctx: StripeWebhookContext;
	rewardData: CheckoutRewardData;
}) => {
	const { org, env } = ctx;
	const { customer, products, stripeSubscriptionId } = rewardData;

	if (!products || products.length === 0) return;

	for (const product of products) {
		ctx.logger.info(
			`[checkout.completed] Queueing checkout reward for product ${product.id}`,
		);

		await addTaskToQueue({
			jobName: JobName.TriggerCheckoutReward,
			payload: {
				// For createWorkerContext
				orgId: org.id,
				env,
				customerId: customer.id,

				// For triggerCheckoutReward
				customer,
				product,
				subId: stripeSubscriptionId,
			},
		});
	}
};
