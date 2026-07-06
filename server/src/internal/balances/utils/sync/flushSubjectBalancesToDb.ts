import type {
	EntityBalance,
	EntityRolloverBalance,
	SubjectBalance,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const SYNC_CONFLICT_CODES = {
	ResetAtMismatch: "RESET_AT_MISMATCH",
	EntityCountMismatch: "ENTITY_COUNT_MISMATCH",
	CacheVersionMismatch: "CACHE_VERSION_MISMATCH",
} as const;

export const isSyncConflictError = (error: Error): boolean => {
	const message = error.message || "";
	return Object.values(SYNC_CONFLICT_CODES).some((code) =>
		message.includes(code),
	);
};

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

export const subjectBalanceToSyncEntry = ({
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

const subjectBalancesToRolloverEntries = ({
	subjectBalances,
}: {
	subjectBalances: SubjectBalance[];
}): RolloverSyncEntry[] =>
	subjectBalances.flatMap((subjectBalance) =>
		// cjson-written values can carry {} for empty arrays; never trust shape.
		(Array.isArray(subjectBalance.rollovers)
			? subjectBalance.rollovers
			: []
		).map((rollover) => ({
			rollover_id: rollover.id,
			balance: rollover.balance ?? 0,
			usage: rollover.usage ?? 0,
			entities: rollover.entities ?? null,
		})),
	);

/**
 * Best-effort flush of cached subject balances to Postgres. Never throws:
 * conflicts mean Postgres is ahead (the rebuild wins), other failures are
 * logged — the caller is invalidating and must proceed either way.
 */
export const flushSubjectBalancesToDb = async ({
	ctx,
	customerId,
	subjectBalances,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	subjectBalances: SubjectBalance[];
	source: string;
}): Promise<void> => {
	if (subjectBalances.length === 0) return;

	const { db, logger } = ctx;
	const entries = subjectBalances.map((subjectBalance) =>
		subjectBalanceToSyncEntry({ subjectBalance }),
	);
	const rolloverEntries = subjectBalancesToRolloverEntries({ subjectBalances });

	const { error } = await tryCatch(
		db.execute(
			sql`SELECT * FROM sync_balances_v2(${JSON.stringify({
				customer_entitlement_updates: entries,
				rollover_updates: rolloverEntries,
				usage_window_updates: [],
			})}::jsonb) ${planetScaleTag({ query: "flushSubjectBalancesToDb" })}`,
		),
	);

	if (!error) {
		logger.info(
			`[flushSubjectBalancesToDb] ${customerId}: flushed ${entries.length} balances, source: ${source}`,
		);
		return;
	}

	if (isSyncConflictError(error)) {
		logger.warn(
			`[flushSubjectBalancesToDb] ${customerId}: sync conflict during flush (Postgres ahead), source: ${source}, error: ${error.message}`,
		);
		return;
	}

	logger.error(
		`[flushSubjectBalancesToDb] ${customerId}: flush failed, unsynced balances lost, source: ${source}, error: ${error}`,
	);
};
