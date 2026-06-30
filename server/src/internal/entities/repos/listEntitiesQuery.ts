import type {
	AppEnv,
	CusProductStatus,
	ListEntitiesParams,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectRowsQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";

type EntityListFilters = Pick<
	ListEntitiesParams,
	"plans" | "processors" | "search"
> & {
	customerId?: string;
};

export const hasEntityListFilters = ({
	plans,
	processors,
	search,
	customerId,
}: EntityListFilters) => {
	return Boolean(
		(plans && plans.length > 0) ||
			(processors && processors.length > 0) ||
			search?.trim() ||
			customerId?.trim(),
	);
};

const getEntityListFilterSql = ({
	plans,
	processors,
	search,
	customerId,
	inStatuses,
}: EntityListFilters & {
	inStatuses: CusProductStatus[];
}) => {
	const filters: SQL[] = [];

	const trimmedCustomerId = customerId?.trim();
	if (trimmedCustomerId) {
		filters.push(sql`AND c.id = ${trimmedCustomerId}`);
	}

	if (plans && plans.length > 0) {
		const planConditions = plans.map((plan) => {
			if (plan.versions && plan.versions.length > 0) {
				return sql`(p_filter.id = ${plan.id} AND p_filter.version IN (${sql.join(
					plan.versions.map((version) => sql`${version}`),
					sql`, `,
				)}))`;
			}

			return sql`p_filter.id = ${plan.id}`;
		});

		filters.push(sql`AND EXISTS (
			SELECT 1
			FROM customer_products cp_filter
			JOIN products p_filter
				ON p_filter.internal_id = cp_filter.internal_product_id
			WHERE cp_filter.internal_customer_id = e.internal_customer_id
				AND (
					cp_filter.internal_entity_id IS NULL
					OR cp_filter.internal_entity_id = e.internal_id
				)
				AND cp_filter.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])
				AND (${sql.join(planConditions, sql` OR `)})
		)`);
	}

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

const getEntityListBaseSql = ({
	orgId,
	env,
	filterSql,
}: {
	orgId: string;
	env: AppEnv;
	filterSql: SQL;
}) => sql`
	FROM entities e
	JOIN customers c
		ON c.internal_id = e.internal_customer_id
	WHERE e.org_id = ${orgId}
		AND e.env = ${env}
		AND c.org_id = ${orgId}
		AND c.env = ${env}
		${filterSql}
`;

export const getPaginatedEntitySubjectsQuery = ({
	orgId,
	env,
	query,
	inStatuses,
}: {
	orgId: string;
	env: AppEnv;
	query: ListEntitiesParams;
	inStatuses: CusProductStatus[];
}) => {
	const filterSql = getEntityListFilterSql({
		plans: query.plans,
		processors: query.processors,
		search: query.search,
		customerId: query.customer_id,
		inStatuses,
	});

	const leadingCtes = sql`
		WITH entity_records AS (
			SELECT e.*
			${getEntityListBaseSql({
				orgId,
				env,
				filterSql,
			})}
			ORDER BY e.internal_id DESC
			LIMIT ${query.limit}
			OFFSET ${query.offset}
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

	return getFullSubjectRowsQuery({
		leadingCtes,
		inStatuses,
		includeInvoices: false,
		includeEntityAggregations: false,
		entityScopedOnly: true,
		queryTag: "getPaginatedEntitySubjects",
	});
};

const countEntities = async ({
	ctx,
	filterSql,
}: {
	ctx: AutumnContext;
	filterSql: SQL;
}) => {
	const rows = await ctx.db.execute(sql`
		SELECT COUNT(*) AS total_count
		${getEntityListBaseSql({
			orgId: ctx.org.id,
			env: ctx.env,
			filterSql,
		})}
		${planetScaleTag({ query: "countEntities" })}
	`);
	const rawCount = (rows[0] as { total_count?: string | number } | undefined)
		?.total_count;

	return Number(rawCount ?? 0);
};

export const countEntitiesByOrgIdAndEnv = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	return countEntities({ ctx, filterSql: sql`` });
};

export const countFilteredEntitiesByOrgIdAndEnv = async ({
	ctx,
	query,
	inStatuses,
}: {
	ctx: AutumnContext;
	query: EntityListFilters;
	inStatuses: CusProductStatus[];
}) => {
	if (!hasEntityListFilters(query)) {
		return countEntitiesByOrgIdAndEnv({ ctx });
	}

	return countEntities({
		ctx,
		filterSql: getEntityListFilterSql({
			plans: query.plans,
			processors: query.processors,
			search: query.search,
			customerId: query.customerId,
			inStatuses,
		}),
	});
};
