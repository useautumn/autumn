import { type FullCustomerEntitlement, pooledBalances } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type PromoteDuePooledContributionsResult = {
	granted: number;
	promotedCount: number;
};

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
