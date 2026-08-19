import { type SQL, sql } from "drizzle-orm";

/** Materialize the claimed page's customer ids so the planner cannot
 * estimate `= ANY($1::text[])` as 1 row and nest-loop the whole product. */
export const pageCustomerIdsCte = ({
	internalCustomerIds,
}: {
	internalCustomerIds: string[];
}): SQL => sql`page AS MATERIALIZED (
	SELECT unnest(${sql.param(internalCustomerIds)}::text[]) AS internal_customer_id
)`;
