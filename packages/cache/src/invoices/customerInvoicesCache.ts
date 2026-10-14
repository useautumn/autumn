import type { Invoice } from "@autumn/shared";
import type { ReadThroughCacheContext } from "../misc/types/readThroughCacheContext.js";
import { REDIS_OP_TIMEOUT_MS } from "../ops/redisOpTimeouts.js";
import { runRedisOp, tryRedisOp } from "../ops/runRedisOp.js";

export const CUSTOMER_INVOICES_CACHE_TTL_SECONDS = 3600;

export const buildCustomerInvoicesCacheKey = ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): string => `invoices:${internalCustomerId}`;

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
		timeoutMs: REDIS_OP_TIMEOUT_MS.customerInvoices,
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
		timeoutMs: REDIS_OP_TIMEOUT_MS.customerInvoices,
	});
};

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
