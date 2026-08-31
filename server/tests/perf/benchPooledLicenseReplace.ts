/**
 * Times pooled replace (entitlement swap + contribution/pool Δ) on an
 * isolated DEV schema. One customer, one pool, N source contributions.
 *
 *   NODE_ENV=development infisical run --env=dev --recursive -- \
 *     bun tests/perf/benchPooledLicenseReplace.ts
 *
 *   BENCHMARK_CONTRIBUTIONS=10000  (default 1_000_000)
 *
 * Does not use staging or prod. Drops the schema on exit.
 */

import { EntInterval } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import { replaceCustomerEntitlementsBatch } from "@/internal/billing/v2/actions/batchTransition/execute/sql/replaceCustomerEntitlementsBatch.js";
import type { ReplaceEntitlementPriceOperation } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { BATCH_TRANSITION_ROW_BATCH_SIZE } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants.js";
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

const CONTRIBUTION_COUNT = Number(
	process.env.BENCHMARK_CONTRIBUTIONS ?? "1000000",
);
if (
	!Number.isInteger(CONTRIBUTION_COUNT) ||
	CONTRIBUTION_COUNT < 1 ||
	CONTRIBUTION_COUNT > 2_000_000
) {
	throw new Error("BENCHMARK_CONTRIBUTIONS must be 1..2000000");
}

const GRANT_FROM = 200;
const GRANT_TO = 400;
const DELTA = GRANT_TO - GRANT_FROM;
const NOW = Date.now();

const LINK_ID = "ppr_link";
const INTERNAL_CUSTOMER_ID = "ppr_cus";
const FROM_ENTITLEMENT_ID = "ppr_ent_from";
const TO_ENTITLEMENT_ID = "ppr_ent_to";
const FEATURE_INTERNAL_ID = "ppr_feat_messages";
const FEATURE_ID = "messages";
const POOL_ID = "ppr_pool";
const SYNTHETIC_ID = "ppr_pool_ce";

const benchmarkDatabaseUrl = new URL(process.env.DATABASE_URL);
benchmarkDatabaseUrl.hostname = benchmarkDatabaseUrl.hostname.replace(
	"-pooler.",
	".",
);

const BENCHMARK_SCHEMA = `pooled_replace_bench_${process.pid}_${Date.now()}`;
if (!/^pooled_replace_bench_\d+_\d+$/.test(BENCHMARK_SCHEMA)) {
	throw new Error("Invalid benchmark schema name");
}

const { initDrizzle } = await import("@/db/initDrizzle.js");
const { db: bootstrapDb, client: bootstrapClient } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: {
		application_name: "pooled-replace-bench-bootstrap",
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
		application_name: "pooled-replace-bench",
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

const operation = {
	type: "replace",
	fromEntitlementIds: [FROM_ENTITLEMENT_ID],
	toEntitlementId: TO_ENTITLEMENT_ID,
	fromEntitlementPrice: {
		entitlement: { id: FROM_ENTITLEMENT_ID, pooled: true },
	},
	toEntitlementPrice: {
		entitlement: {
			id: TO_ENTITLEMENT_ID,
			pooled: true,
			internal_feature_id: FEATURE_INTERNAL_ID,
			feature: { id: FEATURE_ID },
		},
	},
	customerEntitlementPatch: {},
	pooledContributionPatch: { type: "increment", amount: DELTA },
} as ReplaceEntitlementPriceOperation;

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
			'ppr_seat_' || i,
			${INTERNAL_CUSTOMER_ID},
			'ppr_prod_from',
			'ppr_entity_' || i,
			${NOW},
			'active',
			${LINK_ID}
		FROM generate_series(1, ${CONTRIBUTION_COUNT}) AS i
	`);

	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, unlimited, balance, created_at,
			usage_allowed, separate_interval, cache_version, is_pooled_balance
		)
		SELECT
			'ppr_ce_' || i,
			'ppr_seat_' || i,
			${FROM_ENTITLEMENT_ID},
			${INTERNAL_CUSTOMER_ID},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			0,
			${NOW},
			false,
			false,
			0,
			false
		FROM generate_series(1, ${CONTRIBUTION_COUNT}) AS i
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
			${FROM_ENTITLEMENT_ID},
			${INTERNAL_CUSTOMER_ID},
			${FEATURE_INTERNAL_ID},
			${FEATURE_ID},
			false,
			${GRANT_FROM * CONTRIBUTION_COUNT},
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
			'ppr_org',
			'sandbox',
			${INTERNAL_CUSTOMER_ID},
			${FEATURE_INTERNAL_ID},
			false,
			${GRANT_FROM * CONTRIBUTION_COUNT},
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
		INSERT INTO pooled_balance_contributions (
			id, pooled_balance_id, source_customer_product_id,
			source_customer_entitlement_id, current_contribution,
			next_cycle_contribution, created_at, updated_at
		)
		SELECT
			'ppr_contrib_' || i,
			${POOL_ID},
			'ppr_seat_' || i,
			'ppr_ce_' || i,
			${GRANT_FROM},
			${GRANT_FROM},
			${NOW},
			${NOW}
		FROM generate_series(1, ${CONTRIBUTION_COUNT}) AS i
	`);

	await db.execute(sql`
		ANALYZE customer_products, customer_entitlements,
			pooled_balances, pooled_balance_contributions
	`);
};

const runAllBatches = async () => {
	let affected = 0;
	let batches = 0;
	let hasMore = true;
	while (hasMore) {
		const result = await replaceCustomerEntitlementsBatch({
			db,
			customerLicenseLinkId: LINK_ID,
			operation,
			batchSize: BATCH_TRANSITION_ROW_BATCH_SIZE,
		});
		affected += result.affected;
		batches += 1;
		hasMore = result.hasMore;
		if (result.affected === 0 && hasMore) {
			throw new Error("pooled replace made no progress");
		}
	}
	return { affected, batches };
};

const verify = async () => {
	const [row] = await db.execute<{
		swapped: number;
		leftover: number;
		granted: number;
		synthetic_balance: number;
		contribution: number;
	}>(sql`
		SELECT
			(SELECT count(*)::int FROM customer_entitlements
				WHERE entitlement_id = ${TO_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL) AS swapped,
			(SELECT count(*)::int FROM customer_entitlements
				WHERE entitlement_id = ${FROM_ENTITLEMENT_ID}
					AND customer_product_id IS NOT NULL) AS leftover,
			(SELECT granted FROM pooled_balances WHERE id = ${POOL_ID}) AS granted,
			(SELECT balance FROM customer_entitlements WHERE id = ${SYNTHETIC_ID}) AS synthetic_balance,
			(SELECT current_contribution FROM pooled_balance_contributions
				WHERE source_customer_entitlement_id = 'ppr_ce_1') AS contribution
	`);
	const expectedGranted = GRANT_TO * CONTRIBUTION_COUNT;
	if (
		row.swapped !== CONTRIBUTION_COUNT ||
		row.leftover !== 0 ||
		Number(row.granted) !== expectedGranted ||
		Number(row.synthetic_balance) !== expectedGranted ||
		Number(row.contribution) !== GRANT_TO
	) {
		throw new Error(`verify failed: ${JSON.stringify(row)}`);
	}
};

try {
	console.log(
		`DEV schema ${BENCHMARK_SCHEMA}; contributions=${CONTRIBUTION_COUNT.toLocaleString()}; Δ=${DELTA}`,
	);
	console.log(
		`prod batchTransition caps at 100k rows / 20 batches — this loop is the SQL only`,
	);
	await createTables();
	const seeded = await timed({
		label: `seed ${CONTRIBUTION_COUNT.toLocaleString()} seats + contributions + pool`,
		fn: seed,
	});

	const first = await timed({
		label: `first batch (${BATCH_TRANSITION_ROW_BATCH_SIZE.toLocaleString()} rows)`,
		fn: () =>
			replaceCustomerEntitlementsBatch({
				db,
				customerLicenseLinkId: LINK_ID,
				operation,
				batchSize: BATCH_TRANSITION_ROW_BATCH_SIZE,
			}),
	});
	console.log(
		`  affected=${first.result.affected} hasMore=${first.result.hasMore}`,
	);

	const rest = await timed({
		label: "remaining batches",
		fn: runAllBatches,
	});
	const totalMs = first.milliseconds + rest.milliseconds;
	const totalAffected = first.result.affected + rest.result.affected;
	await verify();

	console.table([
		{
			contributions: CONTRIBUTION_COUNT,
			seedMs: Number(seeded.milliseconds.toFixed(1)),
			firstBatchMs: Number(first.milliseconds.toFixed(1)),
			remainingBatches: rest.result.batches,
			remainingMs: Number(rest.milliseconds.toFixed(1)),
			totalReplaceMs: Number(totalMs.toFixed(1)),
			rowsPerSecond: Math.round((totalAffected * 1000) / totalMs),
			msPer5k: Number(
				((totalMs / totalAffected) * BATCH_TRANSITION_ROW_BATCH_SIZE).toFixed(
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
