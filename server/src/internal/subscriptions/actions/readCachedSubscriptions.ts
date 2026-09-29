import { getCachedSubscriptions, setCachedSubscriptions } from "@autumn/cache";
import type { Subscription } from "@autumn/shared";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { SubService } from "../SubService.js";

/** The rows for these Stripe ids, from the misc cache first; only the misses reach Postgres and are written back. */
export const readCachedSubscriptions = async ({
	ctx,
	stripeIds,
}: {
	ctx: Pick<AutumnContext, "db" | "id" | "skipCache">;
	stripeIds: string[];
}): Promise<Subscription[]> => {
	const uniqueStripeIds = [...new Set(stripeIds)];
	if (uniqueStripeIds.length === 0) return [];
	if (ctx.skipCache)
		return SubService.getInStripeIds({ db: ctx.db, ids: uniqueStripeIds });

	const cacheContext = getMiscCacheContext();
	const { found, missingStripeIds } = await getCachedSubscriptions({
		ctx: cacheContext,
		stripeIds: uniqueStripeIds,
		requestId: ctx.id,
	});
	if (missingStripeIds.length === 0) return found;

	const loaded = await SubService.getInStripeIds({
		db: ctx.db,
		ids: missingStripeIds,
	});
	await setCachedSubscriptions({
		ctx: cacheContext,
		subscriptions: loaded,
		requestId: ctx.id,
	});
	return [...found, ...loaded];
};
