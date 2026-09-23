import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const poolIdRowSchema = z.object({ id: z.string() }).strict();

/** Bun's driver flattens a JS array to "a,b", so the list travels as jsonb text. */
const idList = (ids: readonly string[]) =>
	sql`(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb))`;

/** The pools among `pooledBalanceIds` that keep no share once `removedContributionIds` go; license pools live by their seats and are never listed. */
export const listPooledBalancesWithoutOtherContributions = async ({
	ctx,
	pooledBalanceIds,
	removedContributionIds,
}: {
	ctx: Pick<PostgresContext, "db">;
	pooledBalanceIds: string[];
	removedContributionIds: string[];
}): Promise<string[]> => {
	if (pooledBalanceIds.length === 0) return [];
	const rows = parseRows({
		table: "pooled_balances",
		schema: poolIdRowSchema,
		rows: await ctx.db.execute(sql`
			SELECT pb.id
			FROM pooled_balances pb
			WHERE pb.id IN ${idList(pooledBalanceIds)}
				AND pb.customer_license_link_id IS NULL
				AND NOT EXISTS (
					SELECT 1
					FROM pooled_balance_contributions c
					WHERE c.pooled_balance_id = pb.id
						AND c.id NOT IN ${idList(removedContributionIds)}
				)
			ORDER BY pb.id
		`),
	});
	return rows.map(({ id }) => id);
};
