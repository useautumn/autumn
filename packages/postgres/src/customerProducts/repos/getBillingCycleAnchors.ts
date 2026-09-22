import { type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const billingCycleAnchorRowSchema = z
	.object({
		customer_product_id: z.string(),
		billing_cycle_anchor_ms: z.number(),
	})
	.strict();

/** Each plan's subscription anchor, from the row `sub.updated` keeps current; plans without one are absent. */
export const billingCycleAnchorsSql = ({
	ctx,
	customerProductIds,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerProductIds: string[];
}): SQL => sql`
	SELECT cp.id AS customer_product_id,
		(s.billing_cycle_anchor_seconds * 1000)::float8 AS billing_cycle_anchor_ms
	FROM customer_products cp
	JOIN subscriptions s ON s.stripe_id = cp.subscription_ids[1]
	WHERE cp.id = ANY(string_to_array(${customerProductIds.join(",")}, ','))
		AND s.org_id = ${ctx.orgId}
		AND s.env = ${ctx.env}
		AND s.billing_cycle_anchor_seconds IS NOT NULL
`;

export const getBillingCycleAnchors = async ({
	ctx,
	customerProductIds,
}: {
	ctx: PostgresContext;
	customerProductIds: string[];
}): Promise<Record<string, number>> => {
	if (customerProductIds.length === 0) return {};
	const rows = parseRows({
		table: "subscriptions",
		schema: billingCycleAnchorRowSchema,
		rows: await ctx.db.execute(
			billingCycleAnchorsSql({ ctx, customerProductIds }),
		),
	});
	return Object.fromEntries(
		rows.map((row) => [row.customer_product_id, row.billing_cycle_anchor_ms]),
	);
};
