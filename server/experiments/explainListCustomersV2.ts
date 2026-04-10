import { AppEnv } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService.js";
import { getPaginatedFullCusQuery } from "../src/internal/customers/getFullCusQuery.js";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

// Run with `bun run experiments/explainListCustomersV2.ts`
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const SEARCH = "jy@us";
const LIMIT = 200;
const OFFSET = 100;

type ExperimentConfig = {
	orgId: string;
	env: AppEnv;
	search: string;
	limit: number;
	offset: number;
};

const getExperimentConfig = (): ExperimentConfig => {
	return {
		orgId: ORG_ID,
		env: ENV,
		search: SEARCH,
		limit: LIMIT,
		offset: OFFSET,
	};
};

const getFilteredCountQuery = ({
	orgId,
	env,
	search,
}: {
	orgId: string;
	env: AppEnv;
	search: string;
}) => {
	const pattern = `%${search}%`;

	return sql`
		SELECT COUNT(*) AS total_filtered_count
		FROM customers c
		WHERE c.org_id = ${orgId}
			AND c.env = ${env}
			AND (
				c.id ILIKE ${pattern}
				OR c.name ILIKE ${pattern}
				OR c.email ILIKE ${pattern}
			)
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
};

const main = async () => {
	const config = getExperimentConfig();
	const { db } = initDrizzle();

	const pageQuery = getPaginatedFullCusQuery({
		orgId: config.orgId,
		env: config.env,
		inStatuses: RELEVANT_STATUSES,
		includeInvoices: false,
		withEntities: false,
		withTrialsUsed: false,
		withSubs: true,
		limit: config.limit,
		offset: config.offset,
		search: config.search,
		cusProductLimit: 15,
	});
	const filteredCountQuery = getFilteredCountQuery({
		orgId: config.orgId,
		env: config.env,
		search: config.search,
	});

	console.log("=== LIST CUSTOMERS V2 SEARCH EXPERIMENT ===\n");
	console.log(JSON.stringify(config, null, 2));

	await runMeasuredQuery({
		db,
		label: "PAGE QUERY",
		query: pageQuery,
	});

	await runMeasuredQuery({
		db,
		label: "FILTERED COUNT QUERY",
		query: filteredCountQuery,
	});

	process.exit(0);
};

await main();
