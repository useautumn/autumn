import type { InsertCustomerProduct } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";

import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type UpdateCachedCustomerProductResult = {
	ok: boolean;
	updatedCount?: number;
	error?: string;
};

/**
 * Atomically updates specific fields on a cusProduct in the Redis
 * FullCustomer cache. Matches by cusProduct id and applies targeted
 * JSON.SET per field. CRDT-safe.
 */
export const updateCachedCustomerProduct = async ({
	ctx,
	customerId,
	cusProductId,
	updates,
}: {
	ctx: RepoContext;
	customerId: string;
	cusProductId: string;
	updates: Partial<InsertCustomerProduct>;
}): Promise<UpdateCachedCustomerProductResult | null> => {
	try {
		if (!customerId || !ctx.redis) {
			ctx.logger.warn(
				`[updateCachedCustomerProduct] Skipping cache update for cusProduct ${cusProductId} because customerId or redis is missing`,
			);
			return null;
		}

		const { org, env, logger, redis } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const result = await tryRedisWrite(async () => {
			return await redis!.updateCustomerProduct(
				cacheKey,
				JSON.stringify({
					cus_product_id: cusProductId,
					updates,
				}),
			);
		});

		if (result === null) {
			logger.warn(
				`[updateCachedCustomerProduct] Redis write failed for cusProduct ${cusProductId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			ok: boolean;
			updated_count?: number;
			error?: string;
		};

		if (!parsed.ok) {
			logger.warn(
				`[updateCachedCustomerProduct] Lua script error for cusProduct ${cusProductId}: ${parsed.error}`,
			);
		}

		return {
			ok: parsed.ok,
			updatedCount: parsed.updated_count,
			error: parsed.error,
		};
	} catch (error) {
		ctx.logger.error(
			`[updateCachedCustomerProduct] cusProduct ${cusProductId}: error, ${error}`,
		);
		return null;
	}
};
