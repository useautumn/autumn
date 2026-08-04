import type { FullCustomerEntitlement } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type PromoteDuePooledContributionsResult = {
	granted: number;
	promotedCount: number;
};

/**
 * Promotes due next-cycle contributions (effective_at passed) and recomputes
 * granted from ALL contributions in one statement. When the pool has any
 * contributions, granted is ALWAYS written back — self-heals drift and gives
 * concurrent resetters the authoritative value instead of their stale
 * in-memory copy. Contribution-less pools are left untouched.
 * DB + memory only — cache propagation is the caller's job, AFTER its own
 * cache writes (the lazy path patches the subject cache post-reset).
 */
export const promoteDuePooledContributions = async ({
	ctx,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	customerEntitlement: FullCustomerEntitlement;
	now: number;
}): Promise<PromoteDuePooledContributionsResult | null> => {
	const pooledBalance = customerEntitlement.pooled_balance;
	if (!pooledBalance || pooledBalance.unlimited) return null;

	// totals reads the pre-update snapshot: due rows count at their promoted
	// value, so the recomputed granted matches the post-promotion state.
	const rows = await ctx.db.execute<{
		granted: number | string;
		due_count: number | string;
	}>(sql`
		WITH totals AS (
			SELECT
				COALESCE(SUM(CASE
					WHEN effective_at IS NOT NULL AND effective_at <= ${now}::numeric
					THEN next_cycle_contribution
					ELSE current_contribution
				END), 0) AS granted,
				COUNT(*) AS total_count,
				COUNT(*) FILTER (
					WHERE effective_at IS NOT NULL AND effective_at <= ${now}::numeric
				) AS due_count
			FROM pooled_balance_contributions
			WHERE pooled_balance_id = ${pooledBalance.id}
		),
		promoted AS (
			UPDATE pooled_balance_contributions
			SET current_contribution = next_cycle_contribution,
				effective_at = NULL,
				updated_at = ${now}::numeric
			WHERE pooled_balance_id = ${pooledBalance.id}
				AND effective_at IS NOT NULL
				AND effective_at <= ${now}::numeric
			RETURNING id
		)
		UPDATE pooled_balances
		SET granted = totals.granted, updated_at = ${now}::numeric
		FROM totals
		WHERE pooled_balances.id = ${pooledBalance.id}
			AND totals.total_count > 0
		RETURNING pooled_balances.granted::float8 AS granted,
			totals.due_count::int AS due_count
		${planetScaleTag({ query: "promoteDuePooledContributions" })}
	`);

	const row = rows[0];
	if (row === undefined) return null;

	const promotedGranted = Number(row.granted);
	if (!Number.isFinite(promotedGranted)) {
		ctx.logger.error(
			`[promoteDuePooledContributions] non-numeric granted '${row.granted}' for pool ${pooledBalance.id}`,
		);
		return null;
	}

	pooledBalance.granted = promotedGranted;

	return { granted: promotedGranted, promotedCount: Number(row.due_count) };
};
