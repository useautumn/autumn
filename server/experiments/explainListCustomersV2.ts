import { AppEnv, type CusProductStatus, type ListCustomersV2Params } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { ACTIVE_STATUSES, RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService.js";
import { getPaginatedFullCusQuery } from "../src/internal/customers/getFullCusQuery.js";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

// Run with `bun run experiments/explainListCustomersV2.ts`
//
// Optional env vars:
// - LIST_CUSTOMERS_ORG_ID=org_abc
// - LIST_CUSTOMERS_ENV=live|sandbox
// - LIST_CUSTOMERS_LIMIT=50
// - LIST_CUSTOMERS_OFFSET=0
// - LIST_CUSTOMERS_SEARCH=alice
// - LIST_CUSTOMERS_SUBSCRIPTION_STATUS=active
// - LIST_CUSTOMERS_PLANS_JSON='[{"id":"pro","versions":[1]}]'
// - LIST_CUSTOMERS_INCLUDE_INVOICES=true
// - LIST_CUSTOMERS_WITH_ENTITIES=true
// - LIST_CUSTOMERS_WITH_TRIALS_USED=false
// - LIST_CUSTOMERS_WITH_SUBSCRIPTIONS=true

type ExperimentConfig = {
	orgId: string;
	env: AppEnv;
	limit: number;
	offset: number;
	search?: string;
	plans?: ListCustomersV2Params["plans"];
	subscriptionStatus?: CusProductStatus;
	includeInvoices: boolean;
	withEntities: boolean;
	withTrialsUsed: boolean;
	withSubscriptions: boolean;
};

const parseBoolean = ({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: boolean;
}) => {
	const value = process.env[key];
	if (!value) return defaultValue;

	return value.toLowerCase() === "true";
};

const parseNumber = ({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: number;
}) => {
	const value = process.env[key];
	if (!value) return defaultValue;

	const parsedValue = Number(value);
	if (Number.isNaN(parsedValue)) {
		throw new Error(`${key} must be a number`);
	}

	return parsedValue;
};

const parsePlans = () => {
	const rawPlans = process.env.LIST_CUSTOMERS_PLANS_JSON;
	if (!rawPlans) return undefined;

	return JSON.parse(rawPlans) as ListCustomersV2Params["plans"];
};

const getExperimentConfig = (): ExperimentConfig => {
	const rawEnv = process.env.LIST_CUSTOMERS_ENV?.toLowerCase();

	return {
		orgId: process.env.LIST_CUSTOMERS_ORG_ID || prodTestOrgId,
		env: rawEnv === "sandbox" ? AppEnv.Sandbox : AppEnv.Live,
		limit: parseNumber({
			key: "LIST_CUSTOMERS_LIMIT",
			defaultValue: 50,
		}),
		offset: parseNumber({
			key: "LIST_CUSTOMERS_OFFSET",
			defaultValue: 0,
		}),
		search: process.env.LIST_CUSTOMERS_SEARCH?.trim() || undefined,
		plans: parsePlans(),
		subscriptionStatus:
			(process.env.LIST_CUSTOMERS_SUBSCRIPTION_STATUS as CusProductStatus) ||
			undefined,
		includeInvoices: parseBoolean({
			key: "LIST_CUSTOMERS_INCLUDE_INVOICES",
			defaultValue: false,
		}),
		withEntities: parseBoolean({
			key: "LIST_CUSTOMERS_WITH_ENTITIES",
			defaultValue: false,
		}),
		withTrialsUsed: parseBoolean({
			key: "LIST_CUSTOMERS_WITH_TRIALS_USED",
			defaultValue: false,
		}),
		withSubscriptions: parseBoolean({
			key: "LIST_CUSTOMERS_WITH_SUBSCRIPTIONS",
			defaultValue: true,
		}),
	};
};

const hasFilteredQuery = ({
	search,
	plans,
	subscriptionStatus,
}: {
	search?: string;
	plans?: ListCustomersV2Params["plans"];
	subscriptionStatus?: CusProductStatus;
}) => Boolean(plans?.length || search?.trim() || subscriptionStatus);

const getTotalCountQuery = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => sql`
	SELECT COUNT(*) AS total_count
	FROM customers c
	WHERE c.org_id = ${orgId}
		AND c.env = ${env}
`;

const getSearchOnlyFilteredCountQuery = ({
	orgId,
	env,
	search,
}: {
	orgId: string;
	env: AppEnv;
	search?: string;
}) => {
	const pattern = search ? `%${search}%` : undefined;

	return sql`
		SELECT COUNT(*) AS total_filtered_count
		FROM customers c
		WHERE c.org_id = ${orgId}
			AND c.env = ${env}
			${
				pattern
					? sql`AND (
						c.id ILIKE ${pattern}
						OR c.name ILIKE ${pattern}
						OR c.email ILIKE ${pattern}
					)`
					: sql``
			}
	`;
};

const getMatchingProductsQuery = ({
	orgId,
	env,
	plans,
}: {
	orgId: string;
	env: AppEnv;
	plans: NonNullable<ListCustomersV2Params["plans"]>;
}) => {
	const planConditions = plans.map((plan) => {
		if (plan.versions?.length) {
			return sql`(p.id = ${plan.id} AND p.version IN (${sql.join(
				plan.versions.map((version) => sql`${version}`),
				sql`, `,
			)}))`;
		}

		return sql`p.id = ${plan.id}`;
	});

	return sql`
		SELECT p.internal_id
		FROM products p
		WHERE p.org_id = ${orgId}
			AND p.env = ${env}
			AND (${sql.join(planConditions, sql` OR `)})
	`;
};

const getPlanFilteredCountQuery = ({
	orgId,
	env,
	search,
	internalProductIds,
	inStatuses,
}: {
	orgId: string;
	env: AppEnv;
	search?: string;
	internalProductIds: string[];
	inStatuses: CusProductStatus[];
}) => {
	const pattern = search ? `%${search}%` : undefined;

	return sql`
		SELECT COUNT(DISTINCT CASE
			WHEN cp.status IN (${sql.join(
				inStatuses.map((status) => sql`${status}`),
				sql`, `,
			)}) THEN cp.internal_customer_id
		END) AS total_filtered_count
		FROM customer_products cp
		INNER JOIN customers c ON cp.internal_customer_id = c.internal_id
		WHERE cp.internal_product_id IN (${sql.join(
			internalProductIds.map((internalProductId) => sql`${internalProductId}`),
			sql`, `,
		)})
		${
			pattern
				? sql`AND c.org_id = ${orgId}
					AND c.env = ${env}
					AND (
						c.id ILIKE ${pattern}
						OR c.name ILIKE ${pattern}
						OR c.email ILIKE ${pattern}
					)`
				: sql``
		}
	`;
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
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	query: SQL;
}) => {
	console.log(`\n=== ${label} ===\n`);

	const startedAt = performance.now();
	const result = await db.execute(query);
	const elapsedMilliseconds = performance.now() - startedAt;

	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsedMilliseconds.toFixed(2)}ms\n`);

	await printExplainPlan({
		db,
		query,
	});

	return result;
};

const main = async () => {
	const config = getExperimentConfig();
	const { db } = initDrizzle();
	const orgId = config.orgId;

	const pageQuery = getPaginatedFullCusQuery({
		orgId,
		env: config.env,
		inStatuses: config.subscriptionStatus
			? [config.subscriptionStatus]
			: RELEVANT_STATUSES,
		includeInvoices: config.includeInvoices,
		withEntities: config.withEntities,
		withTrialsUsed: config.withTrialsUsed,
		withSubs: config.withSubscriptions,
		limit: config.limit,
		offset: config.offset,
		search: config.search,
		plans: config.plans,
	});
	const totalCountQuery = getTotalCountQuery({
		orgId,
		env: config.env,
	});
	const shouldRunFilteredCount = hasFilteredQuery({
		search: config.search,
		plans: config.plans,
		subscriptionStatus: config.subscriptionStatus,
	});

	console.log("=== LIST CUSTOMERS V2 CONFIG ===\n");
	console.log(
		JSON.stringify(
			{
				...config,
				hasFilteredQuery: shouldRunFilteredCount,
			},
			null,
			2,
		),
	);

	console.log("\n=== ENDPOINT PHASE 1: PAGE + TOTAL COUNT ===\n");
	const phaseOneStartedAt = performance.now();
	const [pageResult, totalCountResult] = await Promise.all([
		db.execute(pageQuery),
		db.execute(totalCountQuery),
	]);
	const phaseOneElapsedMilliseconds = performance.now() - phaseOneStartedAt;

	console.log(`Customers returned: ${pageResult.length}`);
	console.log(
		`Total count row: ${JSON.stringify(totalCountResult[0] ?? null, null, 2)}`,
	);
	console.log(
		`Parallel wall-clock time: ${phaseOneElapsedMilliseconds.toFixed(2)}ms`,
	);

	await runMeasuredQuery({
		db,
		label: "PAGE QUERY",
		query: pageQuery,
	});

	await runMeasuredQuery({
		db,
		label: "TOTAL COUNT QUERY",
		query: totalCountQuery,
	});

	if (!shouldRunFilteredCount) {
		process.exit(0);
	}

	if (!config.plans?.length) {
		const filteredCountQuery = getSearchOnlyFilteredCountQuery({
			orgId,
			env: config.env,
			search: config.search,
		});

		console.log("\n=== ENDPOINT PHASE 2: FILTERED COUNT ===\n");
		const filteredCountStartedAt = performance.now();
		const filteredCountResult = await db.execute(filteredCountQuery);
		const filteredCountElapsedMilliseconds =
			performance.now() - filteredCountStartedAt;

		console.log(
			`Filtered count row: ${JSON.stringify(filteredCountResult[0] ?? null, null, 2)}`,
		);
		console.log(
			`Wall-clock time: ${filteredCountElapsedMilliseconds.toFixed(2)}ms`,
		);

		await runMeasuredQuery({
			db,
			label: "FILTERED COUNT QUERY",
			query: filteredCountQuery,
		});

		process.exit(0);
	}

	const matchingProductsQuery = getMatchingProductsQuery({
		orgId,
		env: config.env,
		plans: config.plans,
	});
	const matchingProductsResult = await runMeasuredQuery({
		db,
		label: "MATCHING PRODUCTS QUERY",
		query: matchingProductsQuery,
	});
	const internalProductIds = matchingProductsResult
		.map((row) => (row as { internal_id: string }).internal_id)
		.filter(Boolean);

	console.log(`\nMatching products found: ${internalProductIds.length}`);

	if (internalProductIds.length === 0) {
		process.exit(0);
	}

	const filteredCountQuery = getPlanFilteredCountQuery({
		orgId,
		env: config.env,
		search: config.search,
		internalProductIds,
		inStatuses: config.subscriptionStatus
			? [config.subscriptionStatus]
			: ACTIVE_STATUSES,
	});

	console.log("\n=== ENDPOINT PHASE 2: FILTERED COUNT ===\n");
	const filteredCountStartedAt = performance.now();
	const filteredCountResult = await db.execute(filteredCountQuery);
	const filteredCountElapsedMilliseconds =
		performance.now() - filteredCountStartedAt;

	console.log(
		`Filtered count row: ${JSON.stringify(filteredCountResult[0] ?? null, null, 2)}`,
	);
	console.log(
		`Wall-clock time: ${filteredCountElapsedMilliseconds.toFixed(2)}ms`,
	);

	await runMeasuredQuery({
		db,
		label: "PLAN FILTERED COUNT QUERY",
		query: filteredCountQuery,
	});

	process.exit(0);
};

await main();
