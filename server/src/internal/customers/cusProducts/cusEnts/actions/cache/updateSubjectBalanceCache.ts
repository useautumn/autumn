import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { RepoContext } from "@/db/repoContext.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

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
		next_reset_at?: number | null;
	};
}) => {
	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
	});

	// Runtime FullSubject cache patches must not mutate cache_version.
	// cache_version is a DB-side stale-sync guard owned by lifecycle/billing flows.
	await tryRedisWrite(
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
};
