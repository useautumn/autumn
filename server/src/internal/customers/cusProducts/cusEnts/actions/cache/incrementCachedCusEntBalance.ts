import type { RepoContext } from "@/db/repoContext.js";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type IncrementCachedCusEntBalanceResult = {
	ok: boolean;
	newBalance?: number;
	newCacheVersion?: number;
};

/**
 * Atomically increments a cusEnt's balance (and cache_version) in the Redis
 * FullCustomer cache via JSON.NUMINCRBY. Safe with concurrent deductions.
 */
export const incrementCachedCusEntBalance = async ({
	ctx,
	customerId,
	cusEntId,
	delta,
}: {
	ctx: RepoContext;
	customerId: string;
	cusEntId: string;
	delta: number;
}): Promise<IncrementCachedCusEntBalanceResult | null> => {
	try {
		const { org, env, logger } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const result = await tryRedisWrite(async () => {
			return await redis.adjustCustomerEntitlementBalance(
				cacheKey,
				JSON.stringify({ cus_ent_id: cusEntId, delta }),
			);
		});

		if (result === null) {
			logger.warn(
				`[incrementCachedCusEntBalance] Redis write failed for cusEnt ${cusEntId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			ok: boolean;
			new_balance?: number;
			new_cache_version?: number;
			error?: string;
		};

		if (!parsed.ok) {
			logger.warn(
				`[incrementCachedCusEntBalance] Lua script error for cusEnt ${cusEntId}: ${parsed.error}`,
			);
		}

		return {
			ok: parsed.ok,
			newBalance: parsed.new_balance,
			newCacheVersion: parsed.new_cache_version,
		};
	} catch (error) {
		ctx.logger.error(
			`[incrementCachedCusEntBalance] cusEnt ${cusEntId}: error, ${error}`,
		);
		return null;
	}
};
