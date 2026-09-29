import type { Invoice } from "@autumn/shared";
import type { ReadThroughCacheContext } from "../misc/types/readThroughCacheContext.js";
import { runRedisOp, tryRedisOp } from "../ops/runRedisOp.js";

/** Bounds the miss-then-stale-set race and any staleness that slips past a repo's DEL. */
export const CUSTOMER_INVOICES_CACHE_TTL_SECONDS = 3600;

/** A stalled read or write-back must cost one extra miss, never a slow request. */
const CUSTOMER_INVOICES_CACHE_OP_TIMEOUT_MS = 300;

/** One list per customer, newest first, the ten a customers.get renders; keyed by the column every invoice write has in hand. */
export const buildCustomerInvoicesCacheKey = ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): string => `invoices:${internalCustomerId}`;

/** Null on a miss, a Redis failure or a corrupt payload: the caller goes to Postgres, never errors. */
export const getCachedCustomerInvoices = async ({
	ctx,
	internalCustomerId,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	internalCustomerId: string;
	requestId?: string;
}): Promise<Invoice[] | null> => {
	const redis = ctx.miscCache.resolve({ requestId });
	const raw = await tryRedisOp({
		operation: () =>
			redis.get(buildCustomerInvoicesCacheKey({ internalCustomerId })),
		source: "customer-invoices-cache:get",
		redisInstance: redis,
		timeoutMs: CUSTOMER_INVOICES_CACHE_OP_TIMEOUT_MS,
	});
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Invoice[];
	} catch (error) {
		ctx.logger.warn("[customerInvoicesCache] cached list is not JSON", {
			data: { internalCustomerId },
			error,
		});
		return null;
	}
};

export const setCachedCustomerInvoices = async ({
	ctx,
	internalCustomerId,
	invoices,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	internalCustomerId: string;
	invoices: Invoice[];
	requestId?: string;
}): Promise<void> => {
	const redis = ctx.miscCache.resolve({ requestId });
	await tryRedisOp({
		operation: () =>
			redis.set(
				buildCustomerInvoicesCacheKey({ internalCustomerId }),
				JSON.stringify(invoices),
				"EX",
				CUSTOMER_INVOICES_CACHE_TTL_SECONDS,
			),
		source: "customer-invoices-cache:set",
		redisInstance: redis,
		timeoutMs: CUSTOMER_INVOICES_CACHE_OP_TIMEOUT_MS,
	});
};

/** Drops the lists on every live target, so a ramped reader never serves the list a repo just changed. */
export const invalidateCustomerInvoicesCache = async ({
	ctx,
	internalCustomerIds,
}: {
	ctx: ReadThroughCacheContext;
	internalCustomerIds: (string | null | undefined)[];
}): Promise<void> => {
	const keys = [...new Set(internalCustomerIds)]
		.filter((internalCustomerId): internalCustomerId is string =>
			Boolean(internalCustomerId),
		)
		.map((internalCustomerId) =>
			buildCustomerInvoicesCacheKey({ internalCustomerId }),
		);
	if (keys.length === 0) return;
	await ctx.miscCache.forEachTarget({
		operation: ({ redis }) => {
			const pipeline = redis.pipeline();
			for (const key of keys) pipeline.del(key);
			return runRedisOp({
				operation: () => pipeline.exec(),
				source: "customer-invoices-cache:invalidate",
				redisInstance: redis,
			});
		},
		onError: ({ target, error }) =>
			ctx.logger.warn("[customerInvoicesCache] invalidate failed", {
				data: { instanceName: target.instanceName, keys },
				error,
			}),
	});
};
