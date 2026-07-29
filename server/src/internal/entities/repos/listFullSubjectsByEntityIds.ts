import {
	type CusProductStatus,
	type FullSubject,
	RELEVANT_STATUSES,
	type SubjectQueryRow,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectRowsQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";
import { resultToFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { hydrateEntityRowsWithCustomerData } from "./hydrateEntityRowsWithCustomerData.js";

/** Entity subjects for a specific set of entity ids — the bounded per-entity
 * view of a customer, sized by the request instead of the whole customer. */
export const listFullSubjectsByEntityIds = async ({
	ctx,
	customerId,
	entityIds,
	inStatuses = RELEVANT_STATUSES,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityIds: string[];
	inStatuses?: CusProductStatus[];
}): Promise<FullSubject[]> => {
	if (entityIds.length === 0) return [];

	const entityIdList = sql.join(
		entityIds.map((entityId) => sql`${entityId}`),
		sql`, `,
	);
	const leadingCtes = sql`
		WITH entity_records AS (
			SELECT e.*
			FROM entities e
			JOIN customers c
				ON c.internal_id = e.internal_customer_id
			WHERE e.org_id = ${ctx.org.id}
				AND e.env = ${ctx.env}
				AND c.org_id = ${ctx.org.id}
				AND c.env = ${ctx.env}
				AND (c.id = ${customerId} OR c.internal_id = ${customerId})
				AND (e.id IN (${entityIdList}) OR e.internal_id IN (${entityIdList}))
		),

		subject_records AS (
			SELECT
				er.internal_id AS subject_key,
				er.internal_customer_id,
				er.internal_id AS internal_entity_id,
				ROW_NUMBER() OVER (ORDER BY er.internal_id DESC) AS subject_order
			FROM entity_records er
		)
	`;

	const rows = await ctx.db.execute(
		getFullSubjectRowsQuery({
			leadingCtes,
			inStatuses,
			includeInvoices: false,
			includeEntityAggregations: false,
			entityScopedOnly: true,
			queryTag: "listFullSubjectsByEntityIds",
		}),
	);
	const mergedRows = await hydrateEntityRowsWithCustomerData({
		ctx,
		entityRows: rows as unknown as SubjectQueryRow[],
		inStatuses,
	});

	return mergedRows.map((row) =>
		resultToFullSubject({ row, entityIdRequested: true }),
	);
};
