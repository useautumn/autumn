/**
 * Times pooled add (insert sources + contributions + granted Δ) and
 * pooled remove (delete contributions, subtract granted, expire) on an
 * isolated DEV schema. One customer, one pre-minted empty pool, N seats.
 *
 *   NODE_ENV=development infisical run --env=dev --recursive -- \
 *     bun tests/perf/benchPooledLicenseAddRemove.ts
 *
 *   BENCHMARK_CONTRIBUTIONS=10000  (default 10_000)
 *
 * Does not use staging or prod. Drops the schema on exit.
 */

import { EntInterval } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import { addCustomerEntitlementsBatch } from "@/internal/billing/v2/actions/batchTransition/execute/sql/addCustomerEntitlementsBatch.js";
import { deleteCustomerEntitlementsBatch } from "@/internal/billing/v2/actions/batchTransition/execute/sql/deleteCustomerEntitlementsBatch.js";
import type {
	AddEntitlementPriceOperation,
	RemoveEntitlementPriceOperation,
} from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { BATCH_TRANSITION_ROW_BATCH_SIZE } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants.js";
import { generateId } from "@/utils/genUtils.js";
import { assertBenchDatabaseSafe } from "./batch-migrations/utils/benchContext.js";

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

const SEAT_COUNT = Number(process.env.BENCHMARK_CONTRIBUTIONS ?? "10000");
if (!Number.isInteger(SEAT_COUNT) || SEAT_COUNT < 1 || SEAT_COUNT > 2_000_000) {
	throw new Error("BENCHMARK_CONTRIBUTIONS must be 1..2000000");
}

const GRANT = 100;
const NOW = Date.now();
const ASSIGNMENT_CUTOFF_MS = NOW + 60_000;

const LINK_ID = "ppar_link";
const INTERNAL_CUSTOMER_ID = "ppar_cus";
const ADD_ENTITLEMENT_ID = "ppar_ent_words";
const FEATURE_INTERNAL_ID = "ppar_feat_words";
const FEATURE_ID = "words";
const POOL_ID = "ppar_pool";
const SYNTHETIC_ID = "ppar_pool_ce";

const benchmarkDatabaseUrl = new URL(process.env.DATABASE_URL);
benchmarkDatabaseUrl.hostname = benchmarkDatabaseUrl.hostname.replace(
	"-pooler.",
	".",
);

const BENCHMARK_SCHEMA = `pooled_add_remove_bench_${process.pid}_${Date.now()}`;
if (!/^pooled_add_remove_bench_\d+_\d+$/.test(BENCHMARK_SCHEMA)) {
	throw new Error("Invalid benchmark schema name");
}

const { initDrizzle } = await import("@/db/initDrizzle.js");
const { db: bootstrapDb, client: bootstrapClient } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: {
		application_name: "pooled-add-remove-bench-bootstrap",
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
		application_name: "pooled-add-remove-bench",
		options: `-c search_path=${BENCHMARK_SCHEMA},public -c statement_timeout=0`,
		query_timeout: 0,
	},
});

const timed = async <T>({
	label,
	fn,
}: {
	label: string;
	fn: () => Promise<T>;
}) => {
	const startedAt = performance.now();
	const result = await fn();
	const milliseconds = performance.now() - startedAt;
	console.log(`${label}: ${(milliseconds / 1000).toFixed(2)}s`);
	return { result, milliseconds };
};

const addOperation = {
	type: "add",
	entitlementPrice: {
		entitlement: { id: ADD_ENTITLEMENT_ID, pooled: true },
	},
	existingEntitlementIds: [ADD_ENTITLEMENT_ID],
	customerEntitlement: {
		entitlement_id: ADD_ENTITLEMENT_ID,
		internal_customer_id: INTERNAL_CUSTOMER_ID,
		internal_feature_id: FEATURE_INTERNAL_ID,
		internal_entity_id: null,
		feature_id: FEATURE_ID,
		customer_id: "ppar_cus_ext",
		unlimited: false,
		balance: 0,
		created_at: NOW,
		reset_cycle_anchor: NOW,
		next_reset_at: NOW,
		usage_allowed: false,
		separate_interval: false,
		adjustment: 0,
		additional_balance: 0,
		entities: null,
		expires_at: null,
		cache_version: 0,
		external_id: null,
	},
	pooledAdd: { contributionAmount: GRANT },
} as AddEntitlementPriceOperation;

const removeOperation = {
	type: "remove",
	entitlementPrice: { entitlement: { pooled: true } },
	fromEntitlementIds: [ADD_ENTITLEMENT_ID],
} as RemoveEntitlementPriceOperation;

const runAddBatch = () =>
	addCustomerEntitlementsBatch({
		db,
		customerLicenseLinkId: LINK_ID,
		assignmentCutoffMs: ASSIGNMENT_CUTOFF_MS,
		customerEntitlementIds: Array.from(
			{ length: BATCH_TRANSITION_ROW_BATCH_SIZE },
			() => generateId("cus_ent"),
		),
		operation: addOperation,
		batchSize: BATCH_TRANSITION_ROW_BATCH_SIZE,
		pooledBalanceId: POOL_ID,
		contributionIds: Array.from(
			{ length: BATCH_TRANSITION_ROW_BATCH_SIZE },
			() => generateId("pool_contribution"),
		),
	});

const runRemoveBatch = () =>
	deleteCustomerEntitlementsBatch({
		db,
		customerLicenseLinkId: LINK_ID,
		operation: removeOperation,
		batchSize: BATCH_TRANSITION_ROW_BATCH_SIZE,
	});

const runRemaining = async ({
	executeBatch,
}: {
	executeBatch: () => Promise<{ affected: number; hasMore: boolean }>;
}) => {
	let affected = 0;
	let batches = 0;
	let hasMore = true;
	while (hasMore) {
		const result = await executeBatch();
		affected += result.affected;
		batches += 1;
		hasMore = result.hasMore;
		if (result.affected === 0 && hasMore) {
			throw new Error("batch made no progress");
		}
	}
	return { affected, batches };
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

const seed = async () => {
	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, internal_entity_id,
			created_at, status, customer_license_link_id
		)
		SELECT
			'ppar_seat_' || i,
			${INTERNAL_CUSTOMER_ID},
			'ppar_prod',
			'ppar_entity_' || i,
			${NOW},
			'active',
			${LINK_ID}
		FROM generate_series(1, ${SEAT_COUNT}) AS i
	`);

	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version, is_pooled_balance,
			pooled_balance_id
		)
		VALUES (
			${SYNTHETIC_ID},
			NULL,
			${ADD_ENTITLEMENT_ID},
			${INTERNAL_CUSTOMER_ID},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			0,
			${NOW},
			false,
			false,
			0,
			true,
			${POOL_ID}
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
			${POOL_ID},
			'ppar_org',
			'sandbox',
			${INTERNAL_CUSTOMER_ID},
			${FEATURE_INTERNAL_ID},
			false,
			0,
			${EntInterval.Month},
			1,
			'lazy',
			'none',
			${SYNTHETIC_ID},
			${LINK_ID},
			${NOW},
			${NOW}
		)
	`);

	await db.execute(sql`
		ANALYZE customer_products, customer_entitlements,
			pooled_balances, pooled_balance_contributions
	`);
};

const verifyAdd = async () => {
	const [row] = await db.execute<{
		sources: number;
		contributions: number;
		granted: number;
		synthetic_balance: number;
		source_balance: number;
		linked_sources: number;
	}>(sql`
		SELECT
			(SELECT count(*)::int FROM customer_entitlements
				WHERE entitlement_id = ${ADD_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL) AS sources,
			(SELECT count(*)::int FROM pooled_balance_contributions
				WHERE pooled_balance_id = ${POOL_ID}) AS contributions,
			(SELECT granted FROM pooled_balances WHERE id = ${POOL_ID}) AS granted,
			(SELECT balance FROM customer_entitlements WHERE id = ${SYNTHETIC_ID}) AS synthetic_balance,
			(SELECT COALESCE(MIN(balance), -1) FROM customer_entitlements
				WHERE entitlement_id = ${ADD_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL) AS source_balance,
			(SELECT count(*)::int FROM customer_entitlements
				WHERE entitlement_id = ${ADD_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL
					AND pooled_contribution_id IS NOT NULL) AS linked_sources
	`);
	const expectedGranted = GRANT * SEAT_COUNT;
	if (
		row.sources !== SEAT_COUNT ||
		row.contributions !== SEAT_COUNT ||
		Number(row.granted) !== expectedGranted ||
		Number(row.synthetic_balance) !== expectedGranted ||
		Number(row.source_balance) !== 0 ||
		row.linked_sources !== SEAT_COUNT
	) {
		throw new Error(`add verify failed: ${JSON.stringify(row)}`);
	}
};

const verifyRemove = async () => {
	const [row] = await db.execute<{
		sources: number;
		contributions: number;
		granted: number;
		pool_expired: boolean;
		synthetic_expired: boolean;
	}>(sql`
		SELECT
			(SELECT count(*)::int FROM customer_entitlements
				WHERE entitlement_id = ${ADD_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL) AS sources,
			(SELECT count(*)::int FROM pooled_balance_contributions
				WHERE pooled_balance_id = ${POOL_ID}) AS contributions,
			(SELECT granted FROM pooled_balances WHERE id = ${POOL_ID}) AS granted,
			(SELECT expires_at IS NOT NULL FROM pooled_balances WHERE id = ${POOL_ID}) AS pool_expired,
			(SELECT expires_at IS NOT NULL FROM customer_entitlements WHERE id = ${SYNTHETIC_ID}) AS synthetic_expired
	`);
	if (
		row.sources !== 0 ||
		row.contributions !== 0 ||
		Number(row.granted) !== 0 ||
		row.pool_expired !== true ||
		row.synthetic_expired !== true
	) {
		throw new Error(`remove verify failed: ${JSON.stringify(row)}`);
	}
};

try {
	console.log(
		`DEV schema ${BENCHMARK_SCHEMA}; seats=${SEAT_COUNT.toLocaleString()}; grant=${GRANT}`,
	);
	await createTables();
	const seeded = await timed({
		label: `seed ${SEAT_COUNT.toLocaleString()} seats + empty pool`,
		fn: seed,
	});

	const firstAdd = await timed({
		label: `add first batch (${BATCH_TRANSITION_ROW_BATCH_SIZE.toLocaleString()} rows)`,
		fn: runAddBatch,
	});
	console.log(
		`  affected=${firstAdd.result.affected} hasMore=${firstAdd.result.hasMore}`,
	);
	const restAdd = await timed({
		label: "add remaining batches",
		fn: () => runRemaining({ executeBatch: runAddBatch }),
	});
	await verifyAdd();

	const firstRemove = await timed({
		label: `remove first batch (${BATCH_TRANSITION_ROW_BATCH_SIZE.toLocaleString()} rows)`,
		fn: runRemoveBatch,
	});
	console.log(
		`  affected=${firstRemove.result.affected} hasMore=${firstRemove.result.hasMore}`,
	);
	const restRemove = await timed({
		label: "remove remaining batches",
		fn: () => runRemaining({ executeBatch: runRemoveBatch }),
	});
	await verifyRemove();

	const addMs = firstAdd.milliseconds + restAdd.milliseconds;
	const removeMs = firstRemove.milliseconds + restRemove.milliseconds;
	const addAffected = firstAdd.result.affected + restAdd.result.affected;
	const removeAffected =
		firstRemove.result.affected + restRemove.result.affected;

	console.table([
		{
			op: "add",
			seats: SEAT_COUNT,
			seedMs: Number(seeded.milliseconds.toFixed(1)),
			firstBatchMs: Number(firstAdd.milliseconds.toFixed(1)),
			remainingBatches: restAdd.result.batches,
			totalMs: Number(addMs.toFixed(1)),
			rowsPerSecond: Math.round((addAffected * 1000) / addMs),
			msPer5k: Number(
				((addMs / addAffected) * BATCH_TRANSITION_ROW_BATCH_SIZE).toFixed(1),
			),
		},
		{
			op: "remove",
			seats: SEAT_COUNT,
			seedMs: Number(seeded.milliseconds.toFixed(1)),
			firstBatchMs: Number(firstRemove.milliseconds.toFixed(1)),
			remainingBatches: restRemove.result.batches,
			totalMs: Number(removeMs.toFixed(1)),
			rowsPerSecond: Math.round((removeAffected * 1000) / removeMs),
			msPer5k: Number(
				((removeMs / removeAffected) * BATCH_TRANSITION_ROW_BATCH_SIZE).toFixed(
					1,
				),
			),
		},
	]);
} finally {
	await client.end();
	await bootstrapDb.execute(
		sql`DROP SCHEMA ${sql.identifier(BENCHMARK_SCHEMA)} CASCADE`,
	);
	await bootstrapClient.end();
}

process.exit(0);
