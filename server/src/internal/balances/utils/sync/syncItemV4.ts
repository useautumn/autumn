import {
	type AppEnv,
	type EntityBalance,
	type EntityRolloverBalance,
	type SubjectBalance,
	tryCatch,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import { refreshEntityAggregateCache } from "./refreshEntityAggregateCache.js";

const SYNC_CONFLICT_CODES = {
	ResetAtMismatch: "RESET_AT_MISMATCH",
	EntityCountMismatch: "ENTITY_COUNT_MISMATCH",
	CacheVersionMismatch: "CACHE_VERSION_MISMATCH",
} as const;

const handleSyncPostgresError = async ({
	error,
	customerId,
	entityId,
	ctx,
}: {
	error: Error;
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
}): Promise<boolean> => {
	const message = error.message || "";
	const isConflict =
		message.includes(SYNC_CONFLICT_CODES.ResetAtMismatch) ||
		message.includes(SYNC_CONFLICT_CODES.EntityCountMismatch) ||
		message.includes(SYNC_CONFLICT_CODES.CacheVersionMismatch);

	if (!isConflict) throw error;

	let code: string = SYNC_CONFLICT_CODES.EntityCountMismatch;
	if (message.includes(SYNC_CONFLICT_CODES.ResetAtMismatch)) {
		code = SYNC_CONFLICT_CODES.ResetAtMismatch;
	} else if (message.includes(SYNC_CONFLICT_CODES.CacheVersionMismatch)) {
		code = SYNC_CONFLICT_CODES.CacheVersionMismatch;
	}
	const cusEntMatch = message.match(/cus_ent_id:(\S+)/);
	const cusEntId = cusEntMatch?.[1];

	ctx.logger.warn(
		`[SYNC V4] (${customerId}) Sync conflict detected: ${code}, cus_ent: ${cusEntId}. Invalidating cache.`,
	);

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		entityId,
		source: `sync-conflict-${code}`,
	});

	return true;
};

interface SyncItemV4 {
	customerId: string;
	entityId?: string;
	orgId: string;
	env: AppEnv;
	timestamp: number;
	rolloverIds?: string[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
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

const subjectBalanceToSyncEntry = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): SyncEntry => ({
	customer_entitlement_id: subjectBalance.id,
	feature_id: subjectBalance.feature_id,
	balance: subjectBalance.balance ?? 0,
	adjustment: subjectBalance.adjustment ?? 0,
	entities: subjectBalance.entities ?? null,
	next_reset_at: subjectBalance.next_reset_at ?? null,
	entity_count: subjectBalance.entities
		? Object.keys(subjectBalance.entities).length
		: 0,
	cache_version: subjectBalance.cache_version ?? 0,
});

const formatSyncEntry = ({ entry }: { entry: SyncEntry }): string => {
	const hasEntities = entry.entities && Object.keys(entry.entities).length > 0;
	const entitiesStr = hasEntities
		? `, entities= ${Object.keys(entry.entities!).length}`
		: "";
	return `${entry.feature_id} (${entry.customer_entitlement_id}): bal= ${entry.balance}, adj= ${entry.adjustment}${entitiesStr}`;
};

const formatRolloverSyncEntry = ({
	entry,
}: {
	entry: RolloverSyncEntry;
}): string => {
	const hasEntities = entry.entities && Object.keys(entry.entities).length > 0;
	const entitiesStr = hasEntities
		? `, entities= ${Object.keys(entry.entities!).length}`
		: "";
	return `rollover ${entry.rollover_id}: bal= ${entry.balance}, usage= ${entry.usage}${entitiesStr}`;
};

/** Sync cached subject balances to Postgres using targeted hash reads. */
export const syncItemV4 = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: SyncItemV4;
}): Promise<void> => {
	const {
		customerId,
		entityId,
		orgId,
		env,
		rolloverIds,
		modifiedCusEntIdsByFeatureId,
	} = payload;
	const { db, logger } = ctx;

	// Read targeted balance hashes
	const allSubjectBalances: SubjectBalance[] = [];
	for (const [featureId, customerEntitlementIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		const result = await getCachedFeatureBalance({
			ctx,
			customerId,
			featureId,
			customerEntitlementIds,
			readMaster: true,
		});

		if (!result) {
			logger.info(
				`[SYNC V4] (${customerId}) Cache miss for feature=${featureId}, skipping`,
			);
			return;
		}

		allSubjectBalances.push(...result.balances);
	}

	// Build sync entries
	const entries: SyncEntry[] = allSubjectBalances.map((subjectBalance) =>
		subjectBalanceToSyncEntry({ subjectBalance }),
	);

	// Build rollover sync entries
	const rolloverEntries: RolloverSyncEntry[] = [];
	if (rolloverIds && rolloverIds.length > 0) {
		const rolloverIdSet = new Set(rolloverIds);
		for (const subjectBalance of allSubjectBalances) {
			if (!subjectBalance.rollovers) continue;
			for (const rollover of subjectBalance.rollovers) {
				if (rolloverIdSet.has(rollover.id)) {
					rolloverEntries.push({
						rollover_id: rollover.id,
						balance: rollover.balance ?? 0,
						usage: rollover.usage ?? 0,
						entities: rollover.entities ?? null,
					});
				}
			}
		}
	}

	if (entries.length === 0 && rolloverEntries.length === 0) {
		logger.info(`[SYNC V4] (${customerId}) No entries to sync`);
		return;
	}

	for (const entry of entries) {
		logger.info(`[SYNC V4] (${customerId}) ${formatSyncEntry({ entry })}`);
	}
	for (const entry of rolloverEntries) {
		logger.info(
			`[SYNC V4] (${customerId}) ${formatRolloverSyncEntry({ entry })}`,
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
			entityId,
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
		`[SYNC V4] (${customerId}) Done: ${updateCount} cus_ents, ${rolloverUpdateCount} rollovers updated`,
	);

	const hasEntityLevel = allSubjectBalances.some(
		(subjectBalance) => subjectBalance.isEntityLevel,
	);
	if (hasEntityLevel) {
		await refreshEntityAggregateCache({
			ctx,
			customerId,
			orgId,
			env,
			featureIds: Object.keys(modifiedCusEntIdsByFeatureId),
		});
	}
};
