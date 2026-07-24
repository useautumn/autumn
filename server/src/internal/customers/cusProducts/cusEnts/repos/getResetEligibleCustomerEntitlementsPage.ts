import { customerEntitlements } from "@autumn/shared";
import { and, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resetCronQueryTag } from "@/internal/balances/batchReset/resetCronQueryTag.js";

export type ResetScanCursor = {
	nextResetAt: number;
	id: string;
};

export type ResetEligibleCustomerEntitlementRow = {
	id: string;
	nextResetAt: number;
};

/**
 * The reset-eligibility predicate: overdue, not expired, not owned by
 * invoice.created, not past a loose expiry. Shared by the scan page query and
 * the backlog count so the two can never drift. Keep in sync with the
 * idx_customer_entitlements_reset_scan partial index predicate (which covers
 * everything except expires_at).
 */
export const resetEligibleFilterSql = ({ dueBefore }: { dueBefore: number }) =>
	sql`${customerEntitlements.next_reset_at} < ${dueBefore}
		AND ${customerEntitlements.expired} IS NOT TRUE
		AND ${customerEntitlements.reset_by_invoice} IS NOT TRUE
		AND (${customerEntitlements.expires_at} IS NULL OR ${customerEntitlements.expires_at} > ${dueBefore})`;

/** The exact scan page statement (tagged). Exported so experiments can
 * EXPLAIN what the cron actually runs. */
export const buildResetEligiblePageQuery = ({
	db,
	dueBefore,
	cursor,
	limit,
}: {
	db: DrizzleCli;
	dueBefore: number;
	cursor: ResetScanCursor | null;
	limit: number;
}) => {
	const query = db
		.select({
			id: customerEntitlements.id,
			next_reset_at: customerEntitlements.next_reset_at,
		})
		.from(customerEntitlements)
		.where(
			and(
				resetEligibleFilterSql({ dueBefore }),
				cursor
					? sql`(${customerEntitlements.next_reset_at}, ${customerEntitlements.id} COLLATE "C") > (${cursor.nextResetAt}, ${cursor.id})`
					: undefined,
			),
		)
		.orderBy(
			customerEntitlements.next_reset_at,
			sql`${customerEntitlements.id} COLLATE "C"`,
		)
		.limit(limit);

	return sql`
		${query}
		${resetCronQueryTag("scanEligible")}
	`;
};

/**
 * One page of the lightweight reset scan: overdue and not expired.
 * Single-table, keyset-paginated on (next_reset_at, id) so page N costs the
 * same as page 1.
 *
 * Eligibility here is intentionally coarse — the batch reset worker classifies
 * product and invoice-driven reset rules after hydration.
 */
export const getResetEligibleCustomerEntitlementsPage = async ({
	db,
	dueBefore,
	cursor,
	limit,
}: {
	db: DrizzleCli;
	dueBefore: number;
	cursor: ResetScanCursor | null;
	limit: number;
}): Promise<ResetEligibleCustomerEntitlementRow[]> => {
	const rows = await db.execute<{
		id: string;
		next_reset_at: number;
	}>(buildResetEligiblePageQuery({ db, dueBefore, cursor, limit }));

	return rows.map((row) => ({
		id: row.id,
		nextResetAt: Number(row.next_reset_at),
	}));
};
