import type { RepoContext } from "@/db/repoContext.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { shadowTapSet } from "@/internal/metering/shadow/shadowTap.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/** Shadow only: this is the absolute-set choke point. Every caller here hands
 *  the Lua a post-state to install rather than a delta to apply, so the grant
 *  tap cannot express it — a fresh attach seeds its whole included allowance
 *  through this path, and without a mirror the metering worker's meter for that
 *  customer/feature stays at zero while the serving path reads the full grant.
 *
 *  Only `balance` is mirrored: it is the one field whose post-state the call
 *  site actually knows. An `adjustment` or `entities` write changes what the
 *  API reports without this layer ever seeing the resulting balance, and
 *  guessing one would put a wrong number into the fold. A negative balance
 *  (overage) has no v1 representation either, so the mapping drops it.
 *
 *  There is no idempotency key at this layer, so the mutation id is the
 *  post-state: replaying the same write installs the same balance on the same
 *  entitlement and folds as a duplicate, while a genuinely different write
 *  necessarily lands on a different balance. Fire-and-forget; it cannot fail
 *  the cache update. */
const mirrorSetToMeteringShadow = ({
	ctx,
	customerId,
	featureId,
	customerEntitlementId,
	balance,
}: {
	ctx: RepoContext;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	balance: number;
}): void => {
	shadowTapSet({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
		value: balance,
		idempotencyKey: `cus_ent:${customerEntitlementId}:set:${balance}`,
	});
};

/** The Lua reports which entitlements it found in the hash and wrote. An entry
 *  missing from the cache is reported as skipped, and nothing was installed. */
const wasApplied = ({
	result,
	customerEntitlementId,
}: {
	result: string | null;
	customerEntitlementId: string;
}): boolean => {
	if (result === null) return false;

	try {
		const parsed = JSON.parse(result) as {
			applied?: Record<string, boolean>;
		};
		return parsed.applied?.[customerEntitlementId] === true;
	} catch {
		return false;
	}
};

export const updateSubjectBalanceCache = async ({
	ctx,
	customerId,
	featureId,
	customerEntitlementId,
	updates,
}: {
	ctx: RepoContext;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	updates: {
		balance?: number | null;
		additional_balance?: number | null;
		adjustment?: number | null;
		entities?: Record<string, unknown> | null;
		reset_cycle_anchor?: number | null;
		next_reset_at?: number | null;
	};
}) => {
	const { redisV2 } = ctx;
	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
	});

	// Runtime FullSubject cache patches must not mutate cache_version.
	// cache_version is a DB-side stale-sync guard owned by lifecycle/billing flows.
	const result = await tryRedisWrite(
		() =>
			redisV2.updateSubjectBalances(
				balanceKey,
				JSON.stringify({
					ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					updates: [
						{
							cus_ent_id: customerEntitlementId,
							balance: updates.balance ?? null,
							additional_balance: updates.additional_balance ?? null,
							adjustment: updates.adjustment ?? null,
							entities: updates.entities ?? null,
							reset_cycle_anchor: updates.reset_cycle_anchor ?? null,
							next_reset_at: updates.next_reset_at ?? null,
							expected_next_reset_at: null,
							rollover_insert: null,
							rollover_overwrites: null,
							rollover_delete_ids: null,
							new_replaceables: null,
							deleted_replaceable_ids: null,
						},
					],
				}),
			),
		redisV2,
	);

	const balance = updates.balance;
	if (
		typeof balance === "number" &&
		Number.isFinite(balance) &&
		wasApplied({ result, customerEntitlementId })
	) {
		mirrorSetToMeteringShadow({
			ctx,
			customerId,
			featureId,
			customerEntitlementId,
			balance,
		});
	}
};
