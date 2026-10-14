import { sql } from "drizzle-orm";

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
