import type { RepoContext } from "@/db/repoContext.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { shadowTapGrant } from "@/internal/metering/shadow/shadowTap.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type AdjustSubjectBalanceCacheResult = {
	ok: boolean;
	newBalance?: number;
	error?: string;
};

/** Shadow only: this is the narrowest Redis choke point for balance-increasing
 *  attach mutations — auto top-ups, one-off purchases and plan rebalances all
 *  land here as a signed delta on one customer entitlement.
 *
 *  Only a positive delta is mirrored: negative deltas on this path are unwinds
 *  of a grant, and the deduct tap already owns the consumption side, so
 *  mirroring them here would double-count against the fold.
 *
 *  There is no idempotency key at this layer, so the mutation id is the
 *  post-state the Lua reported: two writes that leave the same entitlement at
 *  the same balance are the same write, and two genuine grants necessarily
 *  land on different balances. Fire-and-forget; it cannot fail the adjust. */
const mirrorGrantToMeteringShadow = ({
	ctx,
	customerId,
	featureId,
	customerEntitlementId,
	delta,
	newBalance,
}: {
	ctx: RepoContext;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	delta: number;
	newBalance: number | undefined;
}): void => {
	if (delta <= 0) return;

	shadowTapGrant({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
		value: delta,
		idempotencyKey: `cus_ent:${customerEntitlementId}:balance:${newBalance ?? "unknown"}`,
	});
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

		if (parsed.ok) {
			mirrorGrantToMeteringShadow({
				ctx,
				customerId,
				featureId,
				customerEntitlementId,
				delta,
				newBalance: parsed.new_balance,
			});
		} else {
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
