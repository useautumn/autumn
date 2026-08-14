import { ACTIVE_STATUSES } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

/** Fixed recurring prices only: usage/tiered configs carry no flat amount and
 * one_off falls to the CASE's 0. Normalized to a monthly figure.
 * Expects the prices table to be aliased `p` in the surrounding query. */
export const monthlyBasePriceExpr = (): SQL => sql`
	(p.config->>'amount')::numeric
	* CASE p.config->>'interval'
		WHEN 'week' THEN 52.0 / 12
		WHEN 'month' THEN 1
		WHEN 'quarter' THEN 1.0 / 3
		WHEN 'semi_annual' THEN 1.0 / 6
		WHEN 'year' THEN 1.0 / 12
		ELSE 0
	END
	/ GREATEST(COALESCE((p.config->>'interval_count')::numeric, 1), 1)
`;

export const activeStatusListSql = (): SQL =>
	sql.join(
		ACTIVE_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	);
