/**
 * EXPLAIN ANALYZE the exact batch-transition replacement query in an isolated
 * DEV schema. Every measured mutation runs in a rolled-back transaction.
 *
 *   NODE_ENV=development infisical run --env=dev --recursive -- \
 *     bun tests/perf/benchReplaceCustomerEntitlementsBatch.ts
 */
import { type SQL, sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import { buildReplaceCustomerEntitlementsBatchQuery } from "@/internal/billing/v2/actions/batchTransition/execute/sql/replaceCustomerEntitlementsBatch.js";
import type { ReplaceEntitlementPriceOperation } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { assertBenchDatabaseSafe } from "./batch-migrations/utils/benchContext.js";

const ROW_COUNTS = [1_000, 5_000] as const;
const RUNS_PER_SCENARIO = 3;
const STATEMENT_TIMEOUT_MS = 30_000;
const NOISE_ROWS = Number(process.env.BENCHMARK_NOISE_ROWS ?? "1000000");
const OLD_GRANT = 100;
const NEW_GRANT = 500;
const USED_BALANCE = 75;
const FEATURE_INTERNAL_ID = "replace_bench_feature_internal";
const FEATURE_ID = "messages";
const FROM_ENTITLEMENT_ID = "replace_bench_ent_from";
const TO_ENTITLEMENT_ID = "replace_bench_ent_to";
const RETAINED_ENTITLEMENT_ID = "replace_bench_ent_retained";

if (process.env.NODE_ENV !== "development") {
	throw new Error("Run this benchmark with NODE_ENV=development");
}
if (
	process.env.INFISICAL_ENVIRONMENT &&
	process.env.INFISICAL_ENVIRONMENT !== "dev"
) {
	throw new Error("Run this benchmark with the Infisical dev environment");
}
if (process.env.ENV_FILE && process.env.ENV_FILE !== ".env") {
	throw new Error("Run this benchmark with the dev ENV_FILE");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
assertNotProductionDb(process.env.DATABASE_URL);
assertBenchDatabaseSafe();
if (!Number.isInteger(NOISE_ROWS) || NOISE_ROWS < 0 || NOISE_ROWS > 2_000_000) {
	throw new Error("BENCHMARK_NOISE_ROWS must be 0..2000000");
}

const benchmarkDatabaseUrl = new URL(process.env.DATABASE_URL);
benchmarkDatabaseUrl.hostname = benchmarkDatabaseUrl.hostname.replace(
	"-pooler.",
	".",
);

const BENCHMARK_SCHEMA = `replace_entitlements_bench_${process.pid}_${Date.now()}`;
if (!/^replace_entitlements_bench_\d+_\d+$/.test(BENCHMARK_SCHEMA)) {
	throw new Error("Invalid benchmark schema name");
}

const { initDrizzle } = await import("@/db/initDrizzle.js");
const { db: bootstrapDb, client: bootstrapClient } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: {
		application_name: "replace-entitlements-bench-bootstrap",
		query_timeout: 0,
	},
});
await bootstrapDb.execute(
	sql`CREATE SCHEMA ${sql.identifier(BENCHMARK_SCHEMA)}`,
);

const { db, client } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: {
		application_name: "replace-entitlements-bench",
		options: `-c search_path=${BENCHMARK_SCHEMA},public -c statement_timeout=0`,
		query_timeout: 0,
	},
});

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Actual Rows"?: number;
	"Actual Loops"?: number;
	"Shared Hit Blocks"?: number;
	"Shared Read Blocks"?: number;
	"Shared Dirtied Blocks"?: number;
	"Shared Written Blocks"?: number;
	"Temp Read Blocks"?: number;
	"Temp Written Blocks"?: number;
	Plans?: PlanNode[];
};

type ExplainResult = {
	Plan: PlanNode;
	"Planning Time": number;
	"Execution Time": number;
};

type PlanSummary = {
	executionMs: number;
	planningMs: number;
	sharedHits: number;
	sharedReads: number;
	sharedDirtied: number;
	sharedWritten: number;
	tempReads: number;
	tempWritten: number;
	maxLoops: number;
	seqScans: string[];
};

const sumPlanMetrics = ({
	node,
	summary,
}: {
	node: PlanNode;
	summary: PlanSummary;
}) => {
	summary.maxLoops = Math.max(summary.maxLoops, node["Actual Loops"] ?? 0);
	if (node["Node Type"] === "Seq Scan") {
		summary.seqScans.push(
			`${node["Relation Name"] ?? "unknown"} rows=${node["Actual Rows"] ?? 0} loops=${node["Actual Loops"] ?? 0}`,
		);
	}
	for (const child of node.Plans ?? []) {
		sumPlanMetrics({ node: child, summary });
	}
};

const summarizePlan = ({ result }: { result: ExplainResult }): PlanSummary => {
	const summary: PlanSummary = {
		executionMs: result["Execution Time"],
		planningMs: result["Planning Time"],
		sharedHits: result.Plan["Shared Hit Blocks"] ?? 0,
		sharedReads: result.Plan["Shared Read Blocks"] ?? 0,
		sharedDirtied: result.Plan["Shared Dirtied Blocks"] ?? 0,
		sharedWritten: result.Plan["Shared Written Blocks"] ?? 0,
		tempReads: result.Plan["Temp Read Blocks"] ?? 0,
		tempWritten: result.Plan["Temp Written Blocks"] ?? 0,
		maxLoops: 0,
		seqScans: [],
	};
	sumPlanMetrics({ node: result.Plan, summary });
	return summary;
};

const median = ({ values }: { values: number[] }) => {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const createTables = async () => {
	for (const table of [
		"customer_products",
		"customer_entitlements",
		"pooled_balances",
		"pooled_balance_contributions",
	]) {
		await db.execute(
			sql`CREATE TABLE ${sql.identifier(table)} (LIKE public.${sql.identifier(table)} INCLUDING ALL)`,
		);
	}
};

const seedNoise = async () => {
	const now = Date.now();
	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, internal_entity_id,
			created_at, status, customer_license_link_id
		)
		SELECT
			'noise_seat_' || i,
			'noise_customer_' || i,
			'noise_product',
			'noise_entity_' || i,
			${now},
			'active',
			'noise_link_' || i
		FROM generate_series(1, ${NOISE_ROWS}) AS i
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version
		)
		SELECT
			'noise_ce_' || i,
			'noise_seat_' || i,
			'noise_entitlement',
			'noise_customer_' || i,
			'noise_feature_internal',
			'noise_feature',
			false,
			100,
			${now},
			true,
			false,
			0
		FROM generate_series(1, ${NOISE_ROWS}) AS i
	`);
	await db.execute(sql`
		INSERT INTO pooled_balance_contributions (
			id, pooled_balance_id, source_customer_product_id,
			source_customer_entitlement_id, current_contribution,
			next_cycle_contribution, created_at, updated_at
		)
		SELECT
			'noise_contribution_' || i,
			'noise_pool_' || i,
			'noise_seat_' || i,
			'noise_ce_' || i,
			100,
			100,
			${now},
			${now}
		FROM generate_series(1, ${NOISE_ROWS}) AS i
	`);
};

const seedRetained = async ({ rowCount }: { rowCount: number }) => {
	const linkId = `retained_link_${rowCount}`;
	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, internal_entity_id,
			created_at, status, customer_license_link_id
		)
		SELECT
			${`retained_seat_${rowCount}_`} || i,
			${`retained_customer_${rowCount}`},
			'retained_product',
			${`retained_entity_${rowCount}_`} || i,
			${Date.now()},
			'active',
			${linkId}
		FROM generate_series(1, ${rowCount}) AS i
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version
		)
		SELECT
			${`retained_ce_${rowCount}_`} || i,
			${`retained_seat_${rowCount}_`} || i,
			${RETAINED_ENTITLEMENT_ID},
			${`retained_customer_${rowCount}`},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			${USED_BALANCE},
			${Date.now()},
			true,
			false,
			0
		FROM generate_series(1, ${rowCount}) AS i
	`);
	return linkId;
};

const seedPooled = async ({ rowCount }: { rowCount: number }) => {
	const linkId = `pooled_link_${rowCount}`;
	const poolId = `pooled_pool_${rowCount}`;
	const syntheticId = `pooled_synthetic_${rowCount}`;
	const customerInternalId = `pooled_customer_${rowCount}`;
	const totalGrant = OLD_GRANT * rowCount;
	const totalBalance = USED_BALANCE * rowCount;

	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, internal_entity_id,
			created_at, status, customer_license_link_id
		)
		SELECT
			${`pooled_seat_${rowCount}_`} || i,
			${customerInternalId},
			'pooled_product',
			${`pooled_entity_${rowCount}_`} || i,
			${Date.now()},
			'active',
			${linkId}
		FROM generate_series(1, ${rowCount}) AS i
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version, is_pooled_balance,
			pooled_balance_id
		)
		VALUES (
			${syntheticId},
			NULL,
			${FROM_ENTITLEMENT_ID},
			${customerInternalId},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			${totalBalance},
			${Date.now()},
			false,
			false,
			0,
			true,
			${poolId}
		)
	`);
	await db.execute(sql`
		INSERT INTO pooled_balances (
			id, org_id, env, internal_customer_id, internal_feature_id,
			unlimited, granted, interval, interval_count, reset_mode,
			rollover_signature, customer_entitlement_id,
			customer_license_link_id, created_at, updated_at
		)
		VALUES (
			${poolId},
			'replace_bench_org',
			'sandbox',
			${customerInternalId},
			${FEATURE_INTERNAL_ID},
			false,
			${totalGrant},
			'month',
			1,
			'lazy',
			'none',
			${syntheticId},
			${linkId},
			${Date.now()},
			${Date.now()}
		)
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version,
			pooled_contribution_id
		)
		SELECT
			${`pooled_ce_${rowCount}_`} || i,
			${`pooled_seat_${rowCount}_`} || i,
			${FROM_ENTITLEMENT_ID},
			${customerInternalId},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			0,
			${Date.now()},
			false,
			false,
			0,
			${`pooled_contribution_${rowCount}_`} || i
		FROM generate_series(1, ${rowCount}) AS i
	`);
	await db.execute(sql`
		INSERT INTO pooled_balance_contributions (
			id, pooled_balance_id, source_customer_product_id,
			source_customer_entitlement_id, current_contribution,
			next_cycle_contribution, created_at, updated_at
		)
		SELECT
			${`pooled_contribution_${rowCount}_`} || i,
			${poolId},
			${`pooled_seat_${rowCount}_`} || i,
			${`pooled_ce_${rowCount}_`} || i,
			${OLD_GRANT},
			${OLD_GRANT},
			${Date.now()},
			${Date.now()}
		FROM generate_series(1, ${rowCount}) AS i
	`);
	return linkId;
};

const retainedOperation = {
	type: "replace",
	fromEntitlementIds: [RETAINED_ENTITLEMENT_ID],
	toEntitlementId: RETAINED_ENTITLEMENT_ID,
	fromEntitlementPrice: {
		entitlement: {
			id: RETAINED_ENTITLEMENT_ID,
			internal_feature_id: FEATURE_INTERNAL_ID,
			feature: { id: FEATURE_ID },
		},
	},
	toEntitlementPrice: {
		entitlement: {
			id: RETAINED_ENTITLEMENT_ID,
			internal_feature_id: FEATURE_INTERNAL_ID,
			feature: { id: FEATURE_ID },
		},
	},
	customerEntitlementPatch: {
		balance: { type: "set", amount: NEW_GRANT },
	},
} as ReplaceEntitlementPriceOperation;

const pooledOperation = ({ patchType }: { patchType: "increment" | "set" }) =>
	({
		type: "replace",
		fromEntitlementIds: [FROM_ENTITLEMENT_ID],
		toEntitlementId: TO_ENTITLEMENT_ID,
		fromEntitlementPrice: {
			entitlement: {
				id: FROM_ENTITLEMENT_ID,
				internal_feature_id: FEATURE_INTERNAL_ID,
				feature: { id: FEATURE_ID },
			},
		},
		toEntitlementPrice: {
			entitlement: {
				id: TO_ENTITLEMENT_ID,
				internal_feature_id: FEATURE_INTERNAL_ID,
				feature: { id: FEATURE_ID },
			},
		},
		customerEntitlementPatch: {},
		pooledContributionPatch: {
			type: patchType,
			amount: patchType === "increment" ? NEW_GRANT - OLD_GRANT : NEW_GRANT,
		},
	}) as ReplaceEntitlementPriceOperation;

const runExplain = async ({ query }: { query: SQL }): Promise<PlanSummary> => {
	const rollback = new Error("replace benchmark rollback");
	let result: ExplainResult | undefined;
	try {
		await db.transaction(async (transaction) => {
			await transaction.execute(
				sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
			);
			const queryResult = await transaction.execute(
				sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
			);
			const rows = queryResult as unknown as Record<string, unknown>[];
			const raw = Object.values(rows[0] ?? {})[0];
			const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as
				| ExplainResult[]
				| undefined;
			result = parsed?.[0];
			throw rollback;
		});
	} catch (error) {
		if (error !== rollback) throw error;
	}
	if (!result) throw new Error("EXPLAIN returned no plan");
	return summarizePlan({ result });
};

const printScenario = ({
	label,
	rowCount,
	runs,
}: {
	label: string;
	rowCount: number;
	runs: PlanSummary[];
}) => {
	const executionTimes = runs.map((run) => run.executionMs);
	const medianRun = [...runs].sort(
		(left, right) => left.executionMs - right.executionMs,
	)[Math.floor(runs.length / 2)]!;
	console.log(
		`${label} rows=${rowCount.toLocaleString()}: median=${median({ values: executionTimes }).toFixed(2)}ms range=${Math.min(...executionTimes).toFixed(2)}–${Math.max(...executionTimes).toFixed(2)}ms`,
	);
	console.log(
		`  buffers hit=${medianRun.sharedHits} read=${medianRun.sharedReads} dirtied=${medianRun.sharedDirtied} written=${medianRun.sharedWritten} tempRead=${medianRun.tempReads} tempWritten=${medianRun.tempWritten} maxLoops=${medianRun.maxLoops}`,
	);
	console.log(
		`  sequential scans: ${medianRun.seqScans.length === 0 ? "none" : medianRun.seqScans.join("; ")}`,
	);
};

const benchmarkScenario = async ({
	label,
	rowCount,
	query,
}: {
	label: string;
	rowCount: number;
	query: SQL;
}) => {
	const runs: PlanSummary[] = [];
	for (let run = 1; run <= RUNS_PER_SCENARIO; run++) {
		const summary = await runExplain({ query });
		runs.push(summary);
		console.log(
			`  ${label} ${rowCount.toLocaleString()} run ${run}: ${summary.executionMs.toFixed(2)}ms`,
		);
	}
	printScenario({ label, rowCount, runs });
};

try {
	console.log(`DEV schema ${BENCHMARK_SCHEMA}`);
	await createTables();
	console.log(`seeding ${NOISE_ROWS.toLocaleString()} unrelated rows`);
	await seedNoise();
	for (const rowCount of ROW_COUNTS) {
		const retainedLinkId = await seedRetained({ rowCount });
		const pooledLinkId = await seedPooled({ rowCount });
		await db.execute(sql`
			ANALYZE customer_products, customer_entitlements,
				pooled_balances, pooled_balance_contributions
		`);

		await benchmarkScenario({
			label: "retained set",
			rowCount,
			query: buildReplaceCustomerEntitlementsBatchQuery({
				customerLicenseLinkId: retainedLinkId,
				operation: retainedOperation,
				batchSize: rowCount,
			}),
		});
		await benchmarkScenario({
			label: "pooled set",
			rowCount,
			query: buildReplaceCustomerEntitlementsBatchQuery({
				customerLicenseLinkId: pooledLinkId,
				operation: pooledOperation({ patchType: "set" }),
				batchSize: rowCount,
			}),
		});
		await benchmarkScenario({
			label: "pooled increment",
			rowCount,
			query: buildReplaceCustomerEntitlementsBatchQuery({
				customerLicenseLinkId: pooledLinkId,
				operation: pooledOperation({ patchType: "increment" }),
				batchSize: rowCount,
			}),
		});
	}
} finally {
	await client.end();
	await bootstrapDb.execute(
		sql`DROP SCHEMA ${sql.identifier(BENCHMARK_SCHEMA)} CASCADE`,
	);
	await bootstrapClient.end();
}

process.exit(0);
