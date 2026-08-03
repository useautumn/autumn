import { customers } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { CustomerSearchPredicates } from "../../CusSearchService.js";

/**
 * The FROM/WHERE shape that decides export membership. Mirrors the dashboard
 * list query exactly so an export always contains what the table showed.
 */
export const buildMatchedCustomersSelect = ({
	predicates,
	columns,
	extraWhere,
}: {
	predicates: CustomerSearchPredicates;
	columns: SQL;
	extraWhere?: SQL;
}): SQL => {
	const where = extraWhere
		? sql`${predicates.whereRaw} AND ${extraWhere}`
		: predicates.whereRaw;

	return sql`
		SELECT ${columns}
		FROM ${customers}
		WHERE ${where}
	`;
};
