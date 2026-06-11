import type { AppEnv, CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { getFullSubjectRowsQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";

/** Hydrates customer-level subject rows once per customer, merged back into entity list rows by mergeEntityAndCustomerSubjectRows. */
export const getCustomerLevelSubjectRowsQuery = ({
	orgId,
	env,
	internalCustomerIds,
	inStatuses,
}: {
	orgId: string;
	env: AppEnv;
	internalCustomerIds: string[];
	inStatuses: CusProductStatus[];
}) => {
	const idList = sql.join(
		internalCustomerIds.map((internalCustomerId) => sql`${internalCustomerId}`),
		sql`, `,
	);

	const leadingCtes = sql`
		WITH subject_records AS (
			SELECT
				c.internal_id AS subject_key,
				c.internal_id AS internal_customer_id,
				NULL::text AS internal_entity_id,
				ROW_NUMBER() OVER (ORDER BY c.internal_id) AS subject_order
			FROM customers c
			WHERE c.internal_id IN (${idList})
				AND c.org_id = ${orgId}
				AND c.env = ${env}
		)
	`;

	return getFullSubjectRowsQuery({
		leadingCtes,
		inStatuses,
		includeInvoices: false,
		includeEntityAggregations: false,
	});
};
