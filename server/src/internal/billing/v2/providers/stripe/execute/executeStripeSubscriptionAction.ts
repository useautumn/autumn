import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { StripeSubscriptionAction } from "@/internal/billing/v2/billingPlan";

export const executeStripeSubscriptionAction = async ({
	ctx,
	subscriptionAction,
}: {
	ctx: AutumnContext;
	subscriptionAction: StripeSubscriptionAction;
}) => {
	const { org, env } = ctx;
	const stripeClient = createStripeCli({ org, env });

	switch (subscriptionAction.type) {
		case "update":
			return await stripeClient.subscriptions.update(
				subscriptionAction.stripeSubscriptionId,
				subscriptionAction.params,
			);
		case "create":
			return await stripeClient.subscriptions.create(subscriptionAction.params);
		case "cancel":
			return await stripeClient.subscriptions.cancel(
				subscriptionAction.stripeSubscriptionId,
			);
	}
};
