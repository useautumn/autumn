import { type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const promotionRowSchema = z
	.object({ granted: z.number(), total_count: z.number() })
	.strict();

/**
 * Promotes the pool's due contributions and returns what the pool grants now: every contribution at its
 * promoted value. The sum reads the pre-update snapshot, so re-running after the rows moved gives the same number.
 */
export const promoteDuePooledContributionsSql = ({
	pooledBalanceId,
	now,
}: {
	pooledBalanceId: string;
	now: number;
}): SQL => sql`
	WITH promoted AS (
		UPDATE pooled_balance_contributions
		SET current_contribution = next_cycle_contribution,
			effective_at = NULL,
			updated_at = ${now}::numeric
		WHERE pooled_balance_id = ${pooledBalanceId}
			AND effective_at IS NOT NULL
			AND effective_at <= ${now}::numeric
		RETURNING id
	)
	SELECT
		COALESCE(SUM(CASE
			WHEN effective_at IS NOT NULL AND effective_at <= ${now}::numeric
			THEN next_cycle_contribution
			ELSE current_contribution
		END), 0)::float8 AS granted,
		COUNT(*)::int AS total_count
	FROM pooled_balance_contributions
	WHERE pooled_balance_id = ${pooledBalanceId}
`;

/** Null for a pool with no contributions: its grant is not the sum of anything and stays as it is. */
export const promoteDuePooledContributions = async ({
	ctx,
	pooledBalanceId,
	now,
}: {
	ctx: Pick<PostgresContext, "db">;
	pooledBalanceId: string;
	now: number;
}): Promise<number | null> => {
	const [row] = parseRows({
		table: "pooled_balance_contributions",
		schema: promotionRowSchema,
		rows: await ctx.db.execute(
			promoteDuePooledContributionsSql({ pooledBalanceId, now }),
		),
	});
	if (!row || row.total_count === 0) return null;
	return row.granted;
};
