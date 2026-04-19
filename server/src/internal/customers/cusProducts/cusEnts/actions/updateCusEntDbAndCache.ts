import type { InsertCustomerEntitlement } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateSubjectBalanceCache } from "@/internal/customers/cusProducts/cusEnts/actions/cache/updateSubjectBalanceCache.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { CusEntService } from "../CusEntitlementService.js";

/**
 * Updates a cusEnt in both Postgres and the Redis FullCustomer cache.
 */
export const updateCusEntDbAndCache = async ({
	ctx,
	customerId,
	cusEntId,
	updates,
	incrementCacheVersion = false,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusEntId: string;
	updates: Partial<InsertCustomerEntitlement>;
	incrementCacheVersion?: boolean;
	featureId: string;
}): Promise<void> => {
	await CusEntService.update({
		ctx,
		id: cusEntId,
		updates,
		incrementCacheVersion,
	});

	const cacheKey = buildFullCustomerCacheKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	const cacheUpdates = [
		{
			cus_ent_id: cusEntId,
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
	];

	await Promise.all([
		tryRedisWrite(() =>
			redis.updateCustomerEntitlements(
				cacheKey,
				JSON.stringify({ updates: cacheUpdates }),
			),
		),
		updateSubjectBalanceCache({
			ctx,
			customerId,
			featureId,
			customerEntitlementId: cusEntId,
			updates: {
				balance: updates.balance,
				additional_balance: updates.additional_balance,
				adjustment: updates.adjustment,
				entities: updates.entities,
				next_reset_at: updates.next_reset_at,
			},
		}),
	]);
};
