import type { Subscription } from "@shared/models/subModels/subModels";
import type Stripe from "stripe";
import {
	getEarliestPeriodStart,
	getLatestPeriodEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initSubscription } from "@/internal/subscriptions/utils/initSubscription";

/**
 * Creates a Subscription object from a Stripe subscription.
 */
export const initSubscriptionFromStripe = ({
	ctx,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	stripeSubscription: Stripe.Subscription;
}): Subscription => {
	const { org, env } = ctx;

	const subscriptionScheduleId =
		typeof stripeSubscription.schedule === "string"
			? stripeSubscription.schedule
			: typeof stripeSubscription.schedule === "object"
				? stripeSubscription.schedule?.id
				: undefined;

	return initSubscription({
		stripeId: stripeSubscription.id,
		stripeScheduleId: subscriptionScheduleId,
		orgId: org.id,
		env,
		currentPeriodStart: getEarliestPeriodStart({ sub: stripeSubscription }),
		currentPeriodEnd: getLatestPeriodEnd({ sub: stripeSubscription }),
	});
};
