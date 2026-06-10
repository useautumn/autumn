import { AppEnv, type CusProductStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService.js";
import { getFullSubjectRowsQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";
import { getCursorPaginatedEntitySubjectsQuery } from "../src/internal/entities/repos/cursorListEntitiesQuery.js";
import { getCustomerLevelSubjectRowsQuery } from "../src/internal/entities/repos/customerLevelSubjectsQuery.js";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestOrgId,
} from "./experimentEnv";

// Run with `bun run experiments/explainListEntitiesV2.ts` (add --explain for plans).
// Compares the old combined entities.list hydration against the split
// hydration (entity-scoped page query + customer-level query per customer).
// Seed a whale customer via `bun run scripts/seed/seedPaginationBenchmark.ts --count=10`.
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;
const LIMIT = 1000;

/** Pre-split combined hydration: same page CTE, hydrated without entityScopedOnly. */
const getCombinedEntityPageQuery = ({
	orgId,
	env,
	customerId,
	limit,
	inStatuses,
}: {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	limit: number;
	inStatuses: CusProductStatus[];
}) => {
	const customerFilter = customerId ? sql`AND c.id = ${customerId}` : sql``;

	const leadingCtes = sql`
		WITH entity_records AS (
			SELECT e.*
			FROM entities e
			JOIN customers c
				ON c.internal_id = e.internal_customer_id
			WHERE e.org_id = ${orgId}
				AND e.env = ${env}
				AND c.org_id = ${orgId}
				AND c.env = ${env}
				${customerFilter}
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
	});
};

const printExplainPlan = async ({
	db,
	query,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	query: SQL;
}) => {
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
	);

	for (const row of explainResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}
};

const runMeasuredQuery = async ({
	db,
	label,
	query,
	withExplain,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	query: SQL;
	withExplain: boolean;
}) => {
	console.log(`\n=== ${label} ===\n`);

	const startedAt = performance.now();
	const result = await db.execute(query);
	const elapsedMilliseconds = performance.now() - startedAt;

	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsedMilliseconds.toFixed(2)}ms\n`);

	if (withExplain) {
		await printExplainPlan({
			db,
			query,
		});
	}
};

const main = async () => {
	const { db } = initDrizzle();
	const inStatuses = RELEVANT_STATUSES;
	const withExplain = process.argv.includes("--explain");
	// --skip-old: don't run the pre-split query (it can take minutes on whale customers)
	const skipOld = process.argv.includes("--skip-old");

	console.log("=== LIST ENTITIES V2 SPLIT HYDRATION EXPERIMENT ===\n");
	console.log(
		JSON.stringify(
			{ orgId: ORG_ID, env: ENV, customerId: CUSTOMER_ID, limit: LIMIT },
			null,
			2,
		),
	);

	const customerRows = await db.execute(
		sql`SELECT internal_id FROM customers
			WHERE org_id = ${ORG_ID} AND env = ${ENV} AND id = ${CUSTOMER_ID}`,
	);
	const internalCustomerId = (customerRows[0] as { internal_id?: string })
		?.internal_id;
	if (!internalCustomerId) {
		throw new Error(`Customer ${CUSTOMER_ID} not found in org ${ORG_ID}`);
	}

	if (!skipOld) {
		await runMeasuredQuery({
			db,
			label: "OLD COMBINED QUERY (pre-split hydration)",
			query: getCombinedEntityPageQuery({
				orgId: ORG_ID,
				env: ENV,
				customerId: CUSTOMER_ID,
				limit: LIMIT,
				inStatuses,
			}),
			withExplain,
		});
	}

	await runMeasuredQuery({
		db,
		label: "NEW QUERY A (entity-scoped page hydration)",
		query: getCursorPaginatedEntitySubjectsQuery({
			orgId: ORG_ID,
			env: ENV,
			limit: LIMIT,
			cursor: null,
			inStatuses,
			customerId: CUSTOMER_ID,
		}),
		withExplain,
	});

	await runMeasuredQuery({
		db,
		label: "NEW QUERY B (customer-level hydration, once per customer)",
		query: getCustomerLevelSubjectRowsQuery({
			orgId: ORG_ID,
			env: ENV,
			internalCustomerIds: [internalCustomerId],
			inStatuses,
		}),
		withExplain,
	});

	process.exit(0);
};

await main();
