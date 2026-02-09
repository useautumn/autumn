import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { workflows } from "@/queue/workflows";

export const queueCheckoutRewardTasks = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}) => {
	const { fullCustomer, org, env } = ctx;
	const { stripeSubscriptionId, customerProducts } = invoicePaidContext;

	if (!fullCustomer || !customerProducts) return;

	for (const customerProduct of customerProducts) {
		await workflows.triggerGrantCheckoutReward({
			orgId: org.id,
			env,
			customerId: fullCustomer.id ?? "",
			productId: customerProduct.product.id,
			stripeSubscriptionId,
		});
		// await addTaskToQueue({
		// 	jobName: JobName.TriggerCheckoutReward,
		// 	payload: {
		// 		// For createWorkerContext
		// 		orgId: org.id,
		// 		env,
		// 		customerId: fullCustomer.id,

		// 		// For triggerCheckoutReward
		// 		customer: fullCustomer,
		// 		product: customerProduct.product,
		// 		subId: stripeSubscriptionId,
		// 	},
		// });
	}
};
