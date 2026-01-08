import type { FullCustomer, FullCustomerEntitlement } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { getRegionalRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";

export interface SyncItemV3 {
	customerId: string;
	orgId: string;
	env: string;
	region?: string;
	timestamp: number;
	cusEntIds: string[];
}

interface EntitlementSync {
	customer_entitlement_id: string;
	target_balance?: number;
	target_adjustment?: number;
	entity_feature_id?: string;
	target_entity_id?: string;
}

const buildCustomerLevelEntry = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}): EntitlementSync => ({
	customer_entitlement_id: cusEnt.id,
	target_balance: cusEnt.balance ?? 0,
	target_adjustment: cusEnt.adjustment ?? 0,
});

const buildEntityLevelEntries = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}): EntitlementSync[] => {
	if (!cusEnt.entities) return [];

	return Object.entries(cusEnt.entities).map(([entityId, entityBalance]) => ({
		customer_entitlement_id: cusEnt.id,
		target_balance: entityBalance.balance,
		target_adjustment: entityBalance.adjustment,
		entity_feature_id: cusEnt.entitlement?.entity_feature_id ?? undefined,
		target_entity_id: entityId,
	}));
};

const buildSyncEntriesFromFullCustomer = ({
	fullCustomer,
	cusEntIds,
}: {
	fullCustomer: FullCustomer;
	cusEntIds: string[];
}): EntitlementSync[] => {
	const entries: EntitlementSync[] = [];
	const cusEntIdSet = new Set(cusEntIds);

	for (const cusProduct of fullCustomer.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (!cusEntIdSet.has(cusEnt.id)) continue;

			const hasEntityScope = !!cusEnt.entitlement?.entity_feature_id;

			if (hasEntityScope) {
				entries.push(...buildEntityLevelEntries({ cusEnt }));
			} else {
				entries.push(buildCustomerLevelEntry({ cusEnt }));
			}
		}
	}

	return entries;
};

const formatSyncResult = ({
	updates,
}: {
	updates:
		| Record<string, { balance?: number; adjustment?: number }>
		| undefined;
}): string => {
	if (!updates || Object.keys(updates).length === 0) {
		return "no changes";
	}

	return Object.entries(updates)
		.map(([id, data]) => {
			const shortId = id.replace("cus_ent_", "");
			const parts: string[] = [];
			if (data.balance !== undefined) parts.push(`bal=${data.balance}`);
			if (data.adjustment !== undefined) parts.push(`adj=${data.adjustment}`);
			return `${shortId}: ${parts.join(", ")}`;
		})
		.join(" | ");
};

/**
 * Sync FullCustomer cache balances to Postgres
 */
export const syncItemV3 = async ({
	item,
	ctx,
}: {
	item: SyncItemV3;
	ctx: AutumnContext;
}): Promise<void> => {
	const { customerId, region, cusEntIds } = item;
	const { db, logger } = ctx;

	const redisInstance = region ? getRegionalRedis(region) : undefined;

	const fullCustomer = await getCachedFullCustomer({
		orgId: item.orgId,
		env: item.env,
		customerId,
		redisInstance,
	});

	if (!fullCustomer) {
		logger.info(`[SYNC V3] Cache miss for ${customerId}, skipping sync`);
		return;
	}

	const entries = buildSyncEntriesFromFullCustomer({ fullCustomer, cusEntIds });

	if (entries.length === 0) {
		logger.info(`[SYNC V3] No entries to sync for ${customerId}`);
		return;
	}

	const result = await db.execute(
		sql`SELECT * FROM sync_balances(${JSON.stringify({ entitlements: entries })}::jsonb)`,
	);

	const syncResult = result[0] as
		| {
				sync_balances?: {
					updates?: Record<string, { balance?: number; adjustment?: number }>;
				};
		  }
		| undefined;

	const formatted = formatSyncResult({
		updates: syncResult?.sync_balances?.updates,
	});

	logger.info(`[SYNC V3] (${customerId}) ${formatted}`);
};
