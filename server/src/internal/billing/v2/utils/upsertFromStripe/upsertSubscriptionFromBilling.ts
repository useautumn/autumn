import type Stripe from "stripe";
import {
	getEarliestPeriodEnd,
	getLatestPeriodStart,
} from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { SubService } from "@/internal/subscriptions/SubService";
import { generateId } from "@/utils/genUtils";

export const upsertSubscriptionFromBilling = async ({
	ctx,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	stripeSubscription: Stripe.Subscription;
}) => {
	// Store
	const earliestPeriodEnd = getEarliestPeriodEnd({ sub: stripeSubscription });
	const currentPeriodStart = getLatestPeriodStart({ sub: stripeSubscription });

	const updatedSubscription = await SubService.updateFromStripe({
		db: ctx.db,
		stripeSub: stripeSubscription,
	});

	if (updatedSubscription) return;

	await SubService.createSub({
		db: ctx.db,
		sub: {
			id: generateId("sub"),
			stripe_id: stripeSubscription.id,
			stripe_schedule_id: stripeSubscription.schedule as string,
			created_at: stripeSubscription.created * 1000,
			usage_features: [],
			org_id: ctx.org.id,
			env: ctx.env,
			current_period_start: currentPeriodStart,
			current_period_end: earliestPeriodEnd,
		},
	});
};
