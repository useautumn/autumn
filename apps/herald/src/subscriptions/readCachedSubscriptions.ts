import {
	getCachedSubscriptions,
	type ReadThroughCacheContext,
} from "@autumn/cache";
import { getSubscriptionsByStripeIds, type PostgresDb } from "@autumn/postgres";
import type { Subscription } from "@autumn/shared";

/** The server's cached subscription rows, the rest from Postgres. Never written back: the server owns these keys. */
export const readCachedSubscriptions = async ({
	ctx,
	stripeIds,
}: {
	ctx: ReadThroughCacheContext & { db: PostgresDb };
	stripeIds: string[];
}): Promise<Subscription[]> => {
	const uniqueStripeIds = [...new Set(stripeIds)];
	if (uniqueStripeIds.length === 0) return [];
	const { found, missingStripeIds } = await getCachedSubscriptions({
		ctx,
		stripeIds: uniqueStripeIds,
	});
	if (missingStripeIds.length === 0) return found;
	const loaded = await getSubscriptionsByStripeIds({
		ctx,
		stripeIds: missingStripeIds,
	});
	return [...found, ...loaded];
};
