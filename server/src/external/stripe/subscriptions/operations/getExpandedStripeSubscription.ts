import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export type ExpandedStripeSubscription = Stripe.Subscription & {
	schedule: Stripe.SubscriptionSchedule & {
		phases: Stripe.SubscriptionSchedule.Phase[];
	};

	customer: Stripe.Customer;
};

export const getExpandedStripeSubscription = async ({
	ctx,
	subscriptionId,
}: {
	ctx: AutumnContext;
	subscriptionId: string;
}): Promise<ExpandedStripeSubscription> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const expandedStripeSubscription = await stripeCli.subscriptions.retrieve(
		subscriptionId,
		{
			expand: ["schedule.phases", "customer.test_clock"],
		},
	);
	return expandedStripeSubscription as ExpandedStripeSubscription;
};
