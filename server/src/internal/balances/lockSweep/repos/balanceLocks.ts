import { type AppEnv, balanceLocks } from "@autumn/shared";
import { and, asc, eq, gt, lt, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const STATEMENT_TIMEOUT_MS = 5_000;

/** Where the last page ended; the next one starts strictly after it. */
export type DueLockCursor = { expiresAt: number; id: string };

export type DueBalanceLock = {
	id: string;
	org_id: string;
	env: AppEnv;
	lock_id: string;
	customer_id: string;
	expires_at: number;
};

const CONFIRM_ON_EXPIRY = "confirm";

/**
 * One page of due locks that expire by confirming, oldest first, keyset-paged on (expires_at, id).
 * Locks that release on expiry belong to their EventBridge timer. Bounded by its own statement timeout.
 */
export async function getDueConfirmLocks({
	db,
	dueBefore,
	after,
	limit,
}: {
	db: DrizzleCli;
	dueBefore: number;
	after: DueLockCursor | null;
	limit: number;
}): Promise<DueBalanceLock[]> {
	const afterCursor = after
		? or(
				gt(balanceLocks.expires_at, after.expiresAt),
				and(
					eq(balanceLocks.expires_at, after.expiresAt),
					gt(balanceLocks.id, after.id),
				),
			)
		: undefined;
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SET LOCAL statement_timeout = ${sql.raw(String(STATEMENT_TIMEOUT_MS))}`,
		);
		return tx
			.select({
				id: balanceLocks.id,
				org_id: balanceLocks.org_id,
				env: balanceLocks.env,
				lock_id: balanceLocks.lock_id,
				customer_id: balanceLocks.customer_id,
				expires_at: balanceLocks.expires_at,
			})
			.from(balanceLocks)
			.where(
				and(
					lt(balanceLocks.expires_at, dueBefore),
					eq(balanceLocks.expiry_action, CONFIRM_ON_EXPIRY),
					afterCursor,
				),
			)
			.orderBy(asc(balanceLocks.expires_at), asc(balanceLocks.id))
			.limit(limit);
	});
}
