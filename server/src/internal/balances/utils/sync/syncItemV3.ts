import {
	cusProductsToCusEnts,
	type EntityBalance,
	type FullCustomer,
	findCustomerEntitlementById,
} from "@autumn/shared";
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

interface SyncEntry {
	customer_entitlement_id: string;
	feature_id: string;
	balance: number;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
}

const buildSyncEntries = ({
	fullCustomer,
	cusEntIds,
}: {
	fullCustomer: FullCustomer;
	cusEntIds: string[];
}): SyncEntry[] => {
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCustomer.customer_products,
	});

	const entries: SyncEntry[] = [];

	for (const cusEntId of cusEntIds) {
		const cusEnt = findCustomerEntitlementById({
			cusEnts,
			id: cusEntId,
			errorOnNotFound: false,
		});

		if (!cusEnt) continue;

		entries.push({
			customer_entitlement_id: cusEnt.id,
			feature_id: cusEnt.entitlement.feature.id,
			balance: cusEnt.balance ?? 0,
			adjustment: cusEnt.adjustment ?? 0,
			entities: cusEnt.entities ?? null,
		});
	}

	return entries;
};

const formatSyncEntry = ({ entry }: { entry: SyncEntry }): string => {
	const hasEntities = entry.entities && Object.keys(entry.entities).length > 0;
	const entitiesStr = hasEntities
		? `, entities=${Object.keys(entry.entities!).length}`
		: "";
	return `${entry.feature_id} (${entry.customer_entitlement_id}): bal=${entry.balance}, adj=${entry.adjustment}${entitiesStr}`;
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
		logger.info(`[SYNC V3] Cache miss for ${customerId}, skipping`);
		return;
	}

	const entries = buildSyncEntries({ fullCustomer, cusEntIds });

	if (entries.length === 0) {
		logger.info(`[SYNC V3] No entries for ${customerId}`);
		return;
	}

	for (const entry of entries) {
		logger.info(`[SYNC V3] (${customerId}) ${formatSyncEntry({ entry })}`);
	}

	const result = await db.execute(
		sql`SELECT * FROM sync_balances_v2(${JSON.stringify({ customer_entitlement_updates: entries })}::jsonb)`,
	);

	const syncResult = result[0]?.sync_balances_v2 as
		| { updates?: Record<string, unknown> }
		| undefined;

	const updateCount = syncResult?.updates
		? Object.keys(syncResult.updates).length
		: 0;

	logger.info(`[SYNC V3] (${customerId}) Done: ${updateCount} updated`);
};
