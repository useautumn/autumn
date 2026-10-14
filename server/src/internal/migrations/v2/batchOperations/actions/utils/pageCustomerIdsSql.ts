import { type SQL, sql } from "drizzle-orm";

export const pageCustomerIdsCte = ({
	internalCustomerIds,
}: {
	internalCustomerIds: string[];
}): SQL => sql`page AS MATERIALIZED (
	SELECT unnest(${sql.param(internalCustomerIds)}::text[]) AS internal_customer_id
)`;
