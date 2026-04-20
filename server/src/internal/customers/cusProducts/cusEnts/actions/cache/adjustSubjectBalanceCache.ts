import type { RepoContext } from "@/db/repoContext.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type AdjustSubjectBalanceCacheResult = {
	ok: boolean;
	newBalance?: number;
	error?: string;
};

export const adjustSubjectBalanceCache = async ({
	ctx,
	customerId,
	featureId,
	customerEntitlementId,
	delta,
}: {
	ctx: RepoContext;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	delta: number;
}): Promise<AdjustSubjectBalanceCacheResult | null> => {
	try {
		const { redisV2 } = ctx;
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId,
		});

		const result = await tryRedisWrite(
			() =>
				redisV2.adjustSubjectBalance(
					balanceKey,
					JSON.stringify({
						cus_ent_id: customerEntitlementId,
						delta,
						ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					}),
				),
			redisV2,
		);

		if (result === null) {
			ctx.logger.warn(
				`[adjustSubjectBalanceCache] Redis write failed for customer entitlement ${customerEntitlementId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			ok: boolean;
			new_balance?: number;
			error?: string;
		};

		if (!parsed.ok) {
			ctx.logger.warn(
				`[adjustSubjectBalanceCache] Lua script no-op for customer entitlement ${customerEntitlementId}: ${parsed.error}`,
			);
		}

		return {
			ok: parsed.ok,
			newBalance: parsed.new_balance,
			error: parsed.error,
		};
	} catch (error) {
		ctx.logger.error(
			`[adjustSubjectBalanceCache] customer entitlement ${customerEntitlementId}: error, ${error}`,
		);
		return null;
	}
};
