import {
	type EntityBalance,
	type EntityRolloverBalance,
	type FullCustomer,
	findCustomerEntitlementById,
	fullCustomerToCustomerEntitlements,
	tryCatch,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { getRegionalRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";

const SYNC_CONFLICT_CODES = {
	ResetAtMismatch: "RESET_AT_MISMATCH",
	EntityCountMismatch: "ENTITY_COUNT_MISMATCH",
	CacheVersionMismatch: "CACHE_VERSION_MISMATCH",
} as const;

/**
 * Handles sync errors from Postgres. Returns true if error was handled (conflict), false otherwise.
 */
const handleSyncPostgresError = async ({
	error,
	customerId,
	ctx,
}: {
	error: Error;
	customerId: string;
	ctx: AutumnContext;
}): Promise<boolean> => {
	const message = error.message || "";
	const isConflict =
		message.includes(SYNC_CONFLICT_CODES.ResetAtMismatch) ||
		message.includes(SYNC_CONFLICT_CODES.EntityCountMismatch) ||
		message.includes(SYNC_CONFLICT_CODES.CacheVersionMismatch);

	if (!isConflict) {
		throw error;
	}

	// Extract conflict code and cus_ent_id from error message
	let code: string = SYNC_CONFLICT_CODES.EntityCountMismatch;
	if (message.includes(SYNC_CONFLICT_CODES.ResetAtMismatch)) {
		code = SYNC_CONFLICT_CODES.ResetAtMismatch;
	} else if (message.includes(SYNC_CONFLICT_CODES.CacheVersionMismatch)) {
		code = SYNC_CONFLICT_CODES.CacheVersionMismatch;
	}
	const cusEntMatch = message.match(/cus_ent_id:(\S+)/);
	const cusEntId = cusEntMatch?.[1];

	ctx.logger.warn(
		`[SYNC V3] (${customerId}) Sync conflict detected: ${code}, cus_ent: ${cusEntId}. Clearing cache.`,
	);

	// Clear the stale cache
	await deleteCachedFullCustomer({
		customerId,
		ctx,
		source: `sync-conflict-${code}`,
	});

	return true;
};

interface SyncItemV3 {
	customerId: string;
	orgId: string;
	env: string;
	region?: string;
	timestamp: number;
	cusEntIds: string[];
	rolloverIds?: string[];
}

interface SyncEntry {
	customer_entitlement_id: string;
	feature_id: string;
	balance: number;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	next_reset_at: number | null;
	entity_count: number;
	cache_version: number | null;
}

interface RolloverSyncEntry {
	rollover_id: string;
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance> | null;
}

const buildSyncEntries = ({
	fullCustomer,
	cusEntIds,
}: {
	fullCustomer: FullCustomer;
	cusEntIds: string[];
}): SyncEntry[] => {
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
	});

	const entries: SyncEntry[] = [];

	for (const cusEntId of cusEntIds) {
		const cusEnt = findCustomerEntitlementById({
			cusEnts,
			id: cusEntId,
			errorOnNotFound: false,
		});

		if (!cusEnt) continue;

		const entityCount = cusEnt.entities
			? Object.keys(cusEnt.entities).length
			: 0;

		entries.push({
			customer_entitlement_id: cusEnt.id,
			feature_id: cusEnt.entitlement.feature.id,
			balance: cusEnt.balance ?? 0,
			adjustment: cusEnt.adjustment ?? 0,
			entities: cusEnt.entities ?? null,
			next_reset_at: cusEnt.next_reset_at ?? null,
			entity_count: entityCount,
			cache_version: cusEnt.cache_version ?? 0,
		});
	}

	return entries;
};

const buildRolloverSyncEntries = ({
	fullCustomer,
	rolloverIds,
}: {
	fullCustomer: FullCustomer;
	rolloverIds: string[];
}): RolloverSyncEntry[] => {
	if (!rolloverIds || rolloverIds.length === 0) {
		return [];
	}

	const entries: RolloverSyncEntry[] = [];

	for (const cusProduct of fullCustomer.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (!cusEnt.rollovers) continue;

			for (const rollover of cusEnt.rollovers) {
				if (rolloverIds.includes(rollover.id)) {
					entries.push({
						rollover_id: rollover.id,
						balance: rollover.balance ?? 0,
						usage: rollover.usage ?? 0,
						entities: rollover.entities ?? null,
					});
				}
			}
		}
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

const formatRolloverSyncEntry = ({
	entry,
}: {
	entry: RolloverSyncEntry;
}): string => {
	const hasEntities = entry.entities && Object.keys(entry.entities).length > 0;
	const entitiesStr = hasEntities
		? `, entities=${Object.keys(entry.entities!).length}`
		: "";
	return `rollover ${entry.rollover_id}: bal=${entry.balance}, usage=${entry.usage}${entitiesStr}`;
};

/**
 * Sync FullCustomer cache balances to Postgres
 */
export const syncItemV3 = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: SyncItemV3;
}): Promise<void> => {
	const { customerId, orgId, env, region, cusEntIds, rolloverIds } = payload;
	const { db, logger } = ctx;

	const redisInstance = region ? getRegionalRedis(region) : undefined;

	const fullCustomer = await getCachedFullCustomer({
		orgId,
		env,
		customerId,
		redisInstance,
	});

	if (!fullCustomer) {
		logger.info(`[SYNC V3] Cache miss for ${customerId}, skipping`);
		return;
	}

	const entries = buildSyncEntries({ fullCustomer, cusEntIds });
	const rolloverEntries = buildRolloverSyncEntries({
		fullCustomer,
		rolloverIds: rolloverIds ?? [],
	});

	if (entries.length === 0 && rolloverEntries.length === 0) {
		logger.info(`[SYNC V3] No entries for ${customerId}`);
		return;
	}

	for (const entry of entries) {
		logger.info(`[SYNC V3] (${customerId}) ${formatSyncEntry({ entry })}`);
	}

	for (const entry of rolloverEntries) {
		logger.info(
			`[SYNC V3] (${customerId}) ${formatRolloverSyncEntry({ entry })}`,
		);
	}

	const { data: result, error } = await tryCatch(
		db.execute(
			sql`SELECT * FROM sync_balances_v2(${JSON.stringify({
				customer_entitlement_updates: entries,
				rollover_updates: rolloverEntries,
			})}::jsonb)`,
		),
	);

	if (error) {
		await handleSyncPostgresError({
			error,
			customerId,
			ctx,
		});
		return;
	}

	const syncResult = result[0]?.sync_balances_v2 as
		| {
				updates?: Record<string, unknown>;
				rollover_updates?: Record<string, unknown>;
		  }
		| undefined;

	const updateCount = syncResult?.updates
		? Object.keys(syncResult.updates).length
		: 0;
	const rolloverUpdateCount = syncResult?.rollover_updates
		? Object.keys(syncResult.rollover_updates).length
		: 0;

	logger.info(
		`[SYNC V3] (${customerId}) Done: ${updateCount} cus_ents, ${rolloverUpdateCount} rollovers updated`,
	);
};
