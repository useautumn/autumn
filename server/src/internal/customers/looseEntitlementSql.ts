import { sql } from "drizzle-orm";

/**
 * Keeps loose (plan-less) customer entitlements that still mean something:
 * a spendable balance, unlimited, or a boolean flag. Drained one-off grants
 * are dropped so they stop inflating reported granted/usage.
 *
 * Every query that hydrates loose entitlements must apply this — customers.get
 * and customers.list disagreed for exactly as long as one of them didn't.
 */
export const looseEntitlementIsLiveSql = ({
	alias = "ce",
}: {
	alias?: string;
} = {}) => {
	const ce = sql.raw(alias);
	return sql`(
		${ce}.balance != 0
		OR ${ce}.unlimited IS TRUE
		OR EXISTS (
			SELECT 1
			FROM entitlements e
			JOIN features f ON f.internal_id = e.internal_feature_id
			WHERE e.id = ${ce}.entitlement_id
				AND f.type = 'boolean'
		)
	)`;
};
