import { type AppEnv, type SubjectBalance, tryCatch } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import {
	buildFullSubjectBalanceGenerationKey,
	buildFullSubjectBalanceHandoffLockKey,
} from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectBalanceGenerationKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { USAGE_WINDOWS_FIELD } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { roundSubjectBalance } from "@/internal/customers/cache/fullSubject/roundCacheBalance.js";
import { sanitizeCachedSubjectBalance } from "@/internal/customers/cache/fullSubject/sanitize/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { globalRefreshEntityAggregateBatchingManager } from "../refreshEntityAggregate/RefreshEntityAggregateBatchingManager";
import type { UsageWindowUpdate } from "../types/usageWindowUpdate.js";
import {
	type RolloverSyncEntry,
	SYNC_CONFLICT_CODES,
	type SyncEntry,
	subjectBalanceToSyncEntry,
} from "./flushSubjectBalancesToDb.js";
import { logSyncItem } from "./logs/logSyncItem";

export type {
	RolloverSyncEntry,
	SyncEntry,
} from "./flushSubjectBalancesToDb.js";

const SYNC_INVALIDATION_LOCK_TTL_MS = 60_000;

export class RetryableBalanceSyncError extends Error {
	constructor({ reason }: { reason: string }) {
		super(`Balance sync is not safe to acknowledge: ${reason}`);
		this.name = "RetryableBalanceSyncError";
	}
}

const throwRetryableSync = ({ reason }: { reason: string }): never => {
	throw new RetryableBalanceSyncError({ reason });
};

const readCurrentBalanceGeneration = async ({
	redis,
	orgId,
	env,
	customerId,
}: {
	redis: Redis;
	orgId: string;
	env: AppEnv;
	customerId: string;
}): Promise<number> => {
	const currentGenerationValue = await redis.get(
		buildFullSubjectBalanceGenerationKey({ orgId, env, customerId }),
	);
	if (currentGenerationValue === null) return 0;
	const currentGeneration = Number(currentGenerationValue);
	return Number.isSafeInteger(currentGeneration) && currentGeneration >= 0
		? currentGeneration
		: 0;
};

const readCurrentBalances = async ({
	redis,
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementIds,
}: {
	redis: Redis;
	orgId: string;
	env: AppEnv;
	customerId: string;
	featureId: string;
	customerEntitlementIds: string[];
}): Promise<SubjectBalance[]> => {
	if (customerEntitlementIds.length === 0) return [];
	const values = await redis.hmget(
		buildSharedFullSubjectBalanceKey({
			orgId,
			env,
			customerId,
			featureId,
		}),
		...customerEntitlementIds,
	);
	const balances: SubjectBalance[] = [];
	for (const rawBalance of values) {
		if (!rawBalance) continue;
		try {
			balances.push(
				roundSubjectBalance({
					subjectBalance: sanitizeCachedSubjectBalance({
						subjectBalance: JSON.parse(rawBalance),
					}),
				}),
			);
		} catch {
			// Match the existing cache-miss behavior for an unreadable field.
		}
	}
	return balances;
};

const readCurrentUsageWindowUpdates = async ({
	redis,
	orgId,
	env,
	customerId,
	updates,
}: {
	redis: Redis;
	orgId: string;
	env: AppEnv;
	customerId: string;
	updates: UsageWindowUpdate[];
}): Promise<UsageWindowUpdate[]> => {
	const refreshed = await Promise.all(
		updates.map(async (update): Promise<UsageWindowUpdate | undefined> => {
			const rawUsageWindows = await redis.hget(
				buildSharedFullSubjectBalanceKey({
					orgId,
					env,
					customerId,
					featureId: update.feature_id,
				}),
				USAGE_WINDOWS_FIELD,
			);
			if (!rawUsageWindows) return undefined;
			try {
				const usageWindows = JSON.parse(rawUsageWindows);
				return Array.isArray(usageWindows)
					? { ...update, usage_windows: usageWindows }
					: undefined;
			} catch {
				return undefined;
			}
		}),
	);
	return refreshed.filter(
		(update): update is UsageWindowUpdate => update !== undefined,
	);
};

const handleSyncPostgresError = async ({
	error,
	customerId,
	observedGeneration,
	entityId,
	orgId,
	env,
	redis,
	ctx,
}: {
	error: Error;
	customerId: string;
	observedGeneration: number;
	entityId?: string;
	orgId: string;
	env: AppEnv;
	redis: Redis;
	ctx: AutumnContext;
}): Promise<void> => {
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

	const lockKey = buildFullSubjectBalanceHandoffLockKey({
		orgId,
		env,
		customerId,
	});
	const lockToken = crypto.randomUUID();
	const acquired = await redis.set(
		lockKey,
		JSON.stringify({ owner: "sync", token: lockToken }),
		"PX",
		SYNC_INVALIDATION_LOCK_TTL_MS,
		"NX",
	);
	if (acquired !== "OK") {
		throwRetryableSync({ reason: "attach_handoff_in_progress" });
	}

	try {
		const currentGeneration = await readCurrentBalanceGeneration({
			redis,
			orgId,
			env,
			customerId,
		});
		if (currentGeneration !== observedGeneration) {
			throwRetryableSync({ reason: "generation_changed_during_sync" });
		}

		ctx.logger.warn(
			`[SYNC V4] (${customerId}) Sync conflict detected: ${code}, cus_ent: ${cusEntId}. Invalidating cache.`,
		);

		await deleteCachedFullCustomer({
			ctx,
			customerId,
			entityId,
			source: `sync-conflict-${code}`,
		});
	} finally {
		await redis.deleteOwnedLock(lockKey, lockToken).catch(() => undefined);
	}
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

/** Sync cached subject balances to Postgres using targeted hash reads. */
export const syncItemV4 = async ({
	ctx,
	payload,
	redis = ctx.redisV2,
}: {
	ctx: AutumnContext;
	payload: SyncItemV4;
	redis?: Redis;
}): Promise<void> => {
	const {
		customerId,
		entityId,
		orgId,
		env,
		rolloverIds,
		modifiedCusEntIdsByFeatureId,
		usageWindowUpdates,
	} = payload;
	const { db } = ctx;
	const observedGeneration = await readCurrentBalanceGeneration({
		redis,
		orgId,
		env,
		customerId,
	});
	const shouldRefreshFromRedis = observedGeneration > 0;

	// Read targeted balance hashes
	let allSubjectBalances: SubjectBalance[] = [];
	for (const [featureId, customerEntitlementIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		if (shouldRefreshFromRedis) {
			allSubjectBalances.push(
				...(await readCurrentBalances({
					redis,
					orgId,
					env,
					customerId,
					featureId,
					customerEntitlementIds,
				})),
			);
			continue;
		}
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

	const usageWindowEntries: UsageWindowUpdate[] = shouldRefreshFromRedis
		? await readCurrentUsageWindowUpdates({
				redis,
				orgId,
				env,
				customerId,
				updates: usageWindowUpdates ?? [],
			})
		: (usageWindowUpdates ?? []);
	if (shouldRefreshFromRedis) {
		const generationAfterRead = await readCurrentBalanceGeneration({
			redis,
			orgId,
			env,
			customerId,
		});
		if (generationAfterRead !== observedGeneration) {
			throwRetryableSync({ reason: "generation_changed_during_read" });
		}
	}

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
			observedGeneration,
			entityId,
			orgId,
			env,
			redis,
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
