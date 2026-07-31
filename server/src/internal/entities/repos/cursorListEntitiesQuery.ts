import type {
	AppEnv,
	CusProductStatus,
	ListEntitiesParams,
	StandardCursorFields,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { getFullSubjectRowsQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";
import { buildPlanScopeCte, planScopeJoinSql } from "./planFilterScope.js";

const getEntityListFilterSql = ({
	orgId,
	env,
	plans,
	processors,
	search,
	customerId,
	inStatuses,
}: Pick<ListEntitiesParams, "plans" | "processors" | "search"> & {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	inStatuses: CusProductStatus[];
}) => {
	const filters: SQL[] = [];

	const trimmedCustomerId = customerId?.trim();
	if (trimmedCustomerId) {
		filters.push(sql`AND c.id = ${trimmedCustomerId}`);
	}

	// Plans are NOT a filter here. As a correlated EXISTS this probed
	// customer_products per candidate entity: 26.7s / 63.2M buffer reads to return
	// 21 rows on mintlify, because only ~0.5% of entities match a rare plan so the
	// scan walks a long way before the LIMIT fills. Joined via plan_scopes instead.

	const trimmedSearch = search?.trim();
	if (trimmedSearch) {
		const pattern = `%${trimmedSearch}%`;
		filters.push(sql`AND (
			e.id ILIKE ${pattern}
			OR e.name ILIKE ${pattern}
		)`);
	}

	if (processors && processors.length > 0) {
		const processorConditions = processors
			.map((proc) => {
				if (proc === "stripe") return sql`(c.processor->>'id' IS NOT NULL)`;
				if (proc === "revenuecat")
					return sql`EXISTS (
						SELECT 1
						FROM customer_products cp_processor
						WHERE cp_processor.internal_customer_id = c.internal_id
							AND cp_processor.processor->>'type' = 'revenuecat'
					)`;
				if (proc === "vercel")
					return sql`(c.processors->>'vercel' IS NOT NULL)`;
				return null;
			})
			.filter((condition): condition is SQL => condition !== null);

		if (processorConditions.length > 0) {
			filters.push(sql`AND (${sql.join(processorConditions, sql` OR `)})`);
		}
	}

	return sql.join(filters, sql` `);
};

export const getCursorPaginatedEntitySubjectsQuery = ({
	orgId,
	env,
	limit,
	cursor,
	inStatuses,
	plans,
	processors,
	search,
	customerId,
}: {
	orgId: string;
	env: AppEnv;
	limit: number;
	cursor: StandardCursorFields | null;
	inStatuses: CusProductStatus[];
	plans?: ListEntitiesParams["plans"];
	processors?: ListEntitiesParams["processors"];
	search?: string;
	customerId?: string;
}) => {
	const filterSql = getEntityListFilterSql({
		orgId,
		env,
		plans,
		processors,
		search,
		customerId,
		inStatuses,
	});

	const cursorPredicate = cursor
		? sql`AND (e.created_at, e.id) < (${cursor.t}, ${cursor.id})`
		: sql``;

	const planScopeCte = plans?.length
		? buildPlanScopeCte({ orgId, env, plans, inStatuses })
		: sql``;
	const planJoinSql = plans?.length ? planScopeJoinSql : sql``;

	const leadingCtes = sql`
		WITH ${planScopeCte}
		entity_records AS (
			SELECT e.*
			FROM entities e
			JOIN customers c
				ON c.internal_id = e.internal_customer_id
			${planJoinSql}
			WHERE e.org_id = ${orgId}
				AND e.env = ${env}
				AND c.org_id = ${orgId}
				AND c.env = ${env}
				${filterSql}
				${cursorPredicate}
			ORDER BY e.created_at DESC, e.id DESC
			LIMIT ${limit + 1}
		),

		subject_records AS (
			SELECT
				er.internal_id AS subject_key,
				er.internal_customer_id,
				er.internal_id AS internal_entity_id,
				ROW_NUMBER() OVER (ORDER BY er.created_at DESC, er.id DESC) AS subject_order
			FROM entity_records er
		)
	`;

	return getFullSubjectRowsQuery({
		leadingCtes,
		inStatuses,
		includeInvoices: false,
		includeEntityAggregations: false,
		entityScopedOnly: true,
		queryTag: "getCursorPaginatedEntitySubjects",
	});
};
