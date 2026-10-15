import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const grantRowSchema = z
	.object({ pooled_balance_id: z.string(), granted: z.number() })
	.strict();

/** The list travels as one jsonb text parameter, so the statement's text never grows with it. */
const idList = (ids: readonly string[]) =>
	sql`(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb))`;

/**
 * Each pool's grant once its shares due by `dueBy` take their next value: the sum over every share.
 * A pool with no shares is absent, so its grant stays what it is.
 */
export const sumPooledContributionGrants = async ({
	ctx,
	pooledBalanceIds,
	dueBy,
}: {
	ctx: Pick<PostgresContext, "db">;
	pooledBalanceIds: string[];
	dueBy: number;
}): Promise<Record<string, number>> => {
	if (pooledBalanceIds.length === 0) return {};
	// Competing shares (a max / min feature) count once, as their best; the rest add up.
	const result = await ctx.db.execute(sql`
		WITH shares AS (
			SELECT c.pooled_balance_id,
				c.competes,
				c.unlimited,
				CASE
					WHEN c.effective_at IS NOT NULL AND c.effective_at <= ${dueBy}
					THEN c.next_cycle_contribution
					ELSE c.current_contribution
				END AS amount,
				f.config ->> 'combine' AS combine
			FROM pooled_balance_contributions c
			JOIN pooled_balances pb ON pb.id = c.pooled_balance_id
			JOIN features f ON f.internal_id = pb.internal_feature_id
			WHERE c.pooled_balance_id IN ${idList(pooledBalanceIds)}
		)
		SELECT pooled_balance_id,
			(
				COALESCE(SUM(amount) FILTER (WHERE NOT competes), 0)
				+ COALESCE(
					CASE WHEN MAX(combine) = 'min'
						THEN MIN(amount) FILTER (WHERE competes AND NOT unlimited)
						ELSE MAX(amount) FILTER (WHERE competes AND NOT unlimited)
					END,
					0
				)
			)::float8 AS granted
		FROM shares
		GROUP BY pooled_balance_id
	`);
	const rows = parseRows({
		table: "pooled_balance_contributions",
		schema: grantRowSchema,
		rows: result.rows,
	});
	return Object.fromEntries(
		rows.map(({ pooled_balance_id, granted }) => [pooled_balance_id, granted]),
	);
};
