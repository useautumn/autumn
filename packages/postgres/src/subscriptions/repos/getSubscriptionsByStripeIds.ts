import { type Subscription, subscriptions } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { PostgresDb } from "../../types/postgresClient.js";

export const getSubscriptionsByStripeIds = async ({
	ctx,
	stripeIds,
}: {
	ctx: { db: PostgresDb };
	stripeIds: string[];
}): Promise<Subscription[]> =>
	(await ctx.db
		.select()
		.from(subscriptions)
		.where(inArray(subscriptions.stripe_id, stripeIds))) as Subscription[];
