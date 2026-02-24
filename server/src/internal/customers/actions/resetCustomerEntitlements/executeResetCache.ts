import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ResetCusEntParam } from "@/internal/balances/utils/sql/client.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Atomically resets cusEnt fields in the cached FullCustomer blob.
 * Uses the unified updateCustomerEntitlements Lua script.
 * Skips gracefully if the cache doesn't exist or the cusEnt was already reset.
 * Fire-and-forget -- failures are logged but don't propagate.
 */
export const executeResetCache = async ({
	ctx,
	customerId,
	resets,
	oldNextResetAts,
}: {
	ctx: AutumnContext;
	customerId: string;
	resets: ResetCusEntParam[];
	oldNextResetAts: Record<string, number>;
}): Promise<void> => {
	if (resets.length === 0) return;

	const { org, env } = ctx;

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	const updates = resets.map((r) => ({
		cus_ent_id: r.cus_ent_id,
		balance: r.balance,
		additional_balance: r.additional_balance,
		adjustment: r.adjustment,
		entities: r.entities,
		next_reset_at: r.next_reset_at,
		expected_next_reset_at: oldNextResetAts[r.cus_ent_id] ?? null,
		rollover_insert: r.rollover_insert,
		rollover_overwrites: null,
		rollover_delete_ids: null,
		new_replaceables: null,
		deleted_replaceable_ids: null,
	}));

	await tryRedisWrite(() =>
		redis.updateCustomerEntitlements(cacheKey, JSON.stringify({ updates })),
	);
};
