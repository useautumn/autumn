import {
	type AppEnv,
	type EntityBalance,
	type EntityRolloverBalance,
	type SubjectBalance,
	tryCatch,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { globalRefreshEntityAggregateBatchingManager } from "../refreshEntityAggregate/RefreshEntityAggregateBatchingManager";
import type { UsageWindowUpdate } from "../types/usageWindowUpdate.js";
import { logSyncItem } from "./logs/logSyncItem";

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
	/** Post-deduction counter snapshots handed straight from the Lua result
	 *  (no Redis re-read); mirrored to the customer-scoped usage_windows table
	 *  via full-replace per (customer, feature). */
	usageWindowUpdates?: UsageWindowUpdate[];
}

export interface SyncEntry {
	customer_entitlement_id: string;
	feature_id: string;
	balance: number;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	next_reset_at: number | null;
	entity_count: number;
	cache_version: number | null;
}

export interface RolloverSyncEntry {
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
		rolloverIds,
		modifiedCusEntIdsByFeatureId,
		usageWindowUpdates,
	} = payload;
	const { db } = ctx;

	// Read targeted balance hashes
	let allSubjectBalances: SubjectBalance[] = [];
	for (const [featureId, customerEntitlementIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		const outcome = await getCachedFeatureBalance({
			ctx,
			customerId,
			featureId,
			customerEntitlementIds,
			// readMaster: true,
		});

		if (outcome.kind !== "ok") {
			ctx.logger.warn(
				`[SYNC V4] (${customerId}) Cache miss for feature ${featureId}; skipping this feature only.`,
			);
			logSyncItem({
				ctx,
				result: {
					kind: "skipped",
					reason: "cache_miss",
					feature: featureId,
				},
			});
			// A miss (e.g. an invalidation racing the batch) drops the BALANCE
			// sync wholesale, but usage-window snapshots ride in the payload and
			// need no cache read -- they must still land.
			allSubjectBalances = [];
			break;
		}

		allSubjectBalances.push(...outcome.value.balances);
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

	// Customer-scoped usage-window counters arrive pre-built from the deduction
	// result (same atomic Lua execution that incremented them) -- no Redis
	// re-read here. Full-replaced per (customer, feature) by the SQL function.
	const usageWindowEntries: UsageWindowUpdate[] = usageWindowUpdates ?? [];

	if (
		entries.length === 0 &&
		rolloverEntries.length === 0 &&
		usageWindowEntries.length === 0
	) {
		logSyncItem({ ctx, result: { kind: "skipped", reason: "no_entries" } });
		return;
	}

	const { data: result, error } = await tryCatch(
		db.execute(
			sql`SELECT * FROM sync_balances_v2(${JSON.stringify({
				customer_entitlement_updates: entries,
				rollover_updates: rolloverEntries,
				usage_window_updates: usageWindowEntries,
			})}::jsonb) ${planetScaleTag({ query: "syncItemV4" })}`,
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

	logSyncItem({
		ctx,
		result: {
			kind: "synced",
			entries,
			rolloverEntries,
			updateCount,
			rolloverUpdateCount,
		},
	});

	const hasEntityLevel = allSubjectBalances.some(
		(subjectBalance) => subjectBalance.isEntityLevel,
	);
	if (hasEntityLevel) {
		const featureIds = Object.keys(modifiedCusEntIdsByFeatureId);
		const internalFeatureIds = ctx.features
			.filter((feature) => featureIds.includes(feature.id))
			.map((feature) => feature.internal_id);

		globalRefreshEntityAggregateBatchingManager.schedule({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			internalFeatureIds,
		});
	}
};
