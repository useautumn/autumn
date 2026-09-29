import type { Subscription } from "@autumn/shared";
import type { ReadThroughCacheContext } from "../misc/types/readThroughCacheContext.js";
import { REDIS_OP_TIMEOUT_MS } from "../ops/redisOpTimeouts.js";
import { runRedisOp, tryRedisOp } from "../ops/runRedisOp.js";

/** Bounds the miss-then-stale-set race and any staleness that slips past a repo's DEL. */
export const SUBSCRIPTION_CACHE_TTL_SECONDS = 3600;

/** One key per Stripe subscription: the row's own name, so its repo can drop it without knowing the customer. */
export const buildSubscriptionCacheKey = ({
	stripeId,
}: {
	stripeId: string;
}): string => `subscription:${stripeId}`;

/** Anything short of a clean reply is a miss: the id goes to Postgres, never to the caller as an error. */
const cachedSubscriptionOf = ({
	ctx,
	stripeId,
	reply,
}: {
	ctx: ReadThroughCacheContext;
	stripeId: string;
	reply: [error: Error | null, result: unknown] | undefined;
}): Subscription | null => {
	const [error, raw] = reply ?? [null, null];
	if (error) {
		ctx.logger.warn("[subscriptionCache] get failed", {
			data: { stripeId },
			error,
		});
		return null;
	}
	if (typeof raw !== "string") return null;
	try {
		return JSON.parse(raw) as Subscription;
	} catch (error) {
		ctx.logger.warn("[subscriptionCache] cached row is not JSON", {
			data: { stripeId },
			error,
		});
		return null;
	}
};

/** One pipeline, one round trip; the misc client is a single node, so single-key commands need no slot. */
export const getCachedSubscriptions = async ({
	ctx,
	stripeIds,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	stripeIds: string[];
	requestId?: string;
}): Promise<{ found: Subscription[]; missingStripeIds: string[] }> => {
	const redis = ctx.miscCache.resolve({ requestId });
	const pipeline = redis.pipeline();
	for (const stripeId of stripeIds)
		pipeline.get(buildSubscriptionCacheKey({ stripeId }));
	const replies = await tryRedisOp({
		operation: () => pipeline.exec(),
		source: "subscription-cache:get",
		redisInstance: redis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.subscriptions,
	});

	const found: Subscription[] = [];
	const missingStripeIds: string[] = [];
	for (const [index, stripeId] of stripeIds.entries()) {
		const subscription = cachedSubscriptionOf({
			ctx,
			stripeId,
			reply: replies?.[index],
		});
		if (subscription) found.push(subscription);
		else missingStripeIds.push(stripeId);
	}
	return { found, missingStripeIds };
};

/** A row without a Stripe id has no key; the read never asks for one. */
export const setCachedSubscriptions = async ({
	ctx,
	subscriptions,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	subscriptions: Subscription[];
	requestId?: string;
}): Promise<void> => {
	const redis = ctx.miscCache.resolve({ requestId });
	const pipeline = redis.pipeline();
	for (const subscription of subscriptions) {
		if (!subscription.stripe_id) continue;
		pipeline.set(
			buildSubscriptionCacheKey({ stripeId: subscription.stripe_id }),
			JSON.stringify(subscription),
			"EX",
			SUBSCRIPTION_CACHE_TTL_SECONDS,
		);
	}
	if (pipeline.length === 0) return;
	await tryRedisOp({
		operation: () => pipeline.exec(),
		source: "subscription-cache:set",
		redisInstance: redis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.subscriptions,
	});
};

/** Drops the keys on every live target, so a ramped reader never serves the row a repo just rewrote. */
export const invalidateSubscriptionCache = async ({
	ctx,
	stripeIds,
}: {
	ctx: ReadThroughCacheContext;
	stripeIds: (string | null | undefined)[];
}): Promise<void> => {
	const keys = stripeIds
		.filter((stripeId): stripeId is string => Boolean(stripeId))
		.map((stripeId) => buildSubscriptionCacheKey({ stripeId }));
	if (keys.length === 0) return;
	await ctx.miscCache.forEachTarget({
		operation: ({ redis }) => {
			const pipeline = redis.pipeline();
			for (const key of keys) pipeline.del(key);
			return runRedisOp({
				operation: () => pipeline.exec(),
				source: "subscription-cache:invalidate",
				redisInstance: redis,
			});
		},
		onError: ({ target, error }) =>
			ctx.logger.warn("[subscriptionCache] invalidate failed", {
				data: { instanceName: target.instanceName, keys },
				error,
			}),
	});
};
