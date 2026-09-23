import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const grantRowSchema = z
	.object({ pooled_balance_id: z.string(), granted: z.number() })
	.strict();

/** Bun's driver flattens a JS array to "a,b", so the list travels as jsonb text. */
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
	const rows = parseRows({
		table: "pooled_balance_contributions",
		schema: grantRowSchema,
		rows: await ctx.db.execute(sql`
			SELECT c.pooled_balance_id,
				SUM(CASE
					WHEN c.effective_at IS NOT NULL AND c.effective_at <= ${dueBy}
					THEN c.next_cycle_contribution
					ELSE c.current_contribution
				END)::float8 AS granted
			FROM pooled_balance_contributions c
			WHERE c.pooled_balance_id IN ${idList(pooledBalanceIds)}
			GROUP BY c.pooled_balance_id
		`),
	});
	return Object.fromEntries(
		rows.map(({ pooled_balance_id, granted }) => [pooled_balance_id, granted]),
	);
};
