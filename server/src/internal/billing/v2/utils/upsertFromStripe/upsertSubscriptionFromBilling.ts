import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { SubService } from "@/internal/subscriptions/SubService";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";

export const upsertSubscriptionFromBilling = async ({
	ctx,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	stripeSubscription: Stripe.Subscription;
}) => {
	const subscription = initSubscriptionFromStripe({ ctx, stripeSubscription });
	await SubService.upsert({ db: ctx.db, subscription });
};
