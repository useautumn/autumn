import type { EntityRolloverBalance, FullCustomer } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

/** Shape returned by the SQL function's rollover_updates array. */
export interface RolloverOverwrite {
	id: string;
	cus_ent_id: string;
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance>;
}

/**
 * Atomically updates cusEnt fields in the cached FullCustomer blob after a
 * Postgres deduction. Uses the unified updateCustomerEntitlements Lua script.
 * Fire-and-forget -- failures are logged but don't propagate.
 */
export const syncCustomerEntitlementUpdatesToCache = async ({
	ctx,
	customerId,
	fullCustomer,
	cusEntUpdates,
	rolloverOverwrites,
}: {
	ctx: AutumnContext;
	customerId: string;
	fullCustomer: FullCustomer;
	cusEntUpdates: Record<string, DeductionUpdate>;
	rolloverOverwrites: RolloverOverwrite[];
}): Promise<void> => {
	try {
		const cusEntIds = Object.keys(cusEntUpdates);
		if (cusEntIds.length === 0) return;

		const { org, env } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		// Build a lookup of cusEntId -> next_reset_at from the fullCustomer
		// (the value at the time we loaded the customer, used as optimistic guard)
		const cusEntNextResetAts: Record<string, number | null> = {};
		for (const cp of fullCustomer.customer_products) {
			for (const ce of cp.customer_entitlements) {
				cusEntNextResetAts[ce.id] = ce.next_reset_at ?? null;
			}
		}
		for (const ce of fullCustomer.extra_customer_entitlements ?? []) {
			cusEntNextResetAts[ce.id] = ce.next_reset_at ?? null;
		}

		// Group rollover overwrites by cus_ent_id (SQL already provides this)
		const rolloverOverwritesByCusEnt: Record<string, RolloverOverwrite[]> = {};
		for (const ro of rolloverOverwrites) {
			if (!rolloverOverwritesByCusEnt[ro.cus_ent_id]) {
				rolloverOverwritesByCusEnt[ro.cus_ent_id] = [];
			}
			rolloverOverwritesByCusEnt[ro.cus_ent_id].push(ro);
		}

		const updates = cusEntIds.map((cusEntId) => {
			const update = cusEntUpdates[cusEntId];
			return {
				cus_ent_id: cusEntId,
				balance: update.balance,
				additional_balance: update.additional_balance,
				adjustment: update.adjustment,
				entities: update.entities,
				next_reset_at: null,
				expected_next_reset_at: cusEntNextResetAts[cusEntId] ?? null,
				rollover_insert: null,
				rollover_overwrites: rolloverOverwritesByCusEnt[cusEntId] ?? null,
				rollover_delete_ids: null,
				new_replaceables: update.newReplaceables ?? null,
				deleted_replaceable_ids:
					update.deletedReplaceables?.map((r) => r.id) ?? null,
			};
		});

		await tryRedisWrite(() =>
			redis.updateCustomerEntitlements(cacheKey, JSON.stringify({ updates })),
		);
	} catch (error) {
		ctx.logger.error(
			`[syncCustomerEntitlementUpdatesToCache] Failed to sync customer entitlement updates to cache: ${error}`,
		);
	}
};
