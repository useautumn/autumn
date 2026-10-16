import { type FullCustomerEntitlement, pooledBalances } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type PromoteDuePooledContributionsResult = {
	granted: number;
	promotedCount: number;
};

/**
 * Promotes due next-cycle contributions (effective_at passed). Subscription-
 * keyed pools recompute granted from ALL contributions. License-keyed granted
 * is purchased × G — this statement only promotes due rows, it does not
 * rewrite granted from Σ. Contribution-less subscription pools are left
 * untouched.
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

	const isLicenseKeyed = pooledBalance.customer_license_link_id != null;

	// totals reads the pre-update snapshot: due rows count at their promoted
	// value, so the recomputed granted matches the post-promotion state.
	// The pool UPDATE guards on updated_at (latest row version vs statement
	// snapshot): a transition committing mid-statement makes it 0 rows, and
	// the contribution promotion is gated on it, so the whole statement no-ops.
	// License-keyed granted is purchased × G, not Σ contributions.
	const rows = await ctx.db.execute<{
		granted: number | string;
		due_count: number | string;
	}>(sql`
		WITH shares AS (
			SELECT
				c.competes,
				c.unlimited,
				c.effective_at,
				CASE
					WHEN c.effective_at IS NOT NULL AND c.effective_at <= ${now}::numeric
					THEN c.next_cycle_contribution
					ELSE c.current_contribution
				END AS amount,
				f.config ->> 'combine' AS combine
			FROM pooled_balance_contributions c
			JOIN pooled_balances pb ON pb.id = c.pooled_balance_id
			JOIN features f ON f.internal_id = pb.internal_feature_id
			WHERE c.pooled_balance_id = ${pooledBalance.id}
		),
		totals AS (
			SELECT
				COALESCE(SUM(amount) FILTER (WHERE NOT competes), 0)
				+ COALESCE(
					CASE WHEN MAX(combine) = 'min'
						THEN MIN(amount) FILTER (WHERE competes AND NOT unlimited)
						ELSE MAX(amount) FILTER (WHERE competes AND NOT unlimited)
					END,
					0
				) AS granted,
				COUNT(*) AS total_count,
				COUNT(*) FILTER (
					WHERE effective_at IS NOT NULL AND effective_at <= ${now}::numeric
				) AS due_count
			FROM shares
		),
		pool_update AS (
			UPDATE pooled_balances
			SET
				granted = ${isLicenseKeyed ? sql`pooled_balances.granted` : sql`totals.granted`},
				updated_at = ${now}::numeric
			FROM totals
			WHERE pooled_balances.id = ${pooledBalance.id}
				AND ${
					isLicenseKeyed
						? sql`totals.due_count > 0`
						: sql`totals.total_count > 0`
				}
				AND pooled_balances.updated_at = (
					SELECT updated_at FROM pooled_balances
					WHERE id = ${pooledBalance.id}
				)
			RETURNING pooled_balances.granted, totals.due_count
		),
		promoted AS (
			UPDATE pooled_balance_contributions
			SET current_contribution = next_cycle_contribution,
				effective_at = NULL,
				updated_at = ${now}::numeric
			WHERE pooled_balance_id = ${pooledBalance.id}
				AND effective_at IS NOT NULL
				AND effective_at <= ${now}::numeric
				AND EXISTS (SELECT 1 FROM pool_update)
			RETURNING id
		)
		SELECT pool_update.granted::float8 AS granted,
			pool_update.due_count::int AS due_count
		FROM pool_update
		${planetScaleTag({ query: "promoteDuePooledContributions" })}
	`);

	const row = rows[0];
	if (row === undefined) {
		// Guard trip (or contribution-less pool): a concurrent writer owns the
		// latest granted — refresh it so the caller can't refill from a stale
		// in-memory value if it goes on to win the reset CAS.
		const [freshPool] = await ctx.db
			.select({ granted: pooledBalances.granted })
			.from(pooledBalances)
			.where(eq(pooledBalances.id, pooledBalance.id));
		if (freshPool) pooledBalance.granted = freshPool.granted;
		return null;
	}

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
