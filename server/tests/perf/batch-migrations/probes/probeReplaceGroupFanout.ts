/**
 * Times the new filter-replace hot path against the DEV DB: candidate SELECT
 * (join entitlements AS definition) + N applyReplacePatches groups per page.
 *
 * Average = 1 grant-delta group (everyone on the same live def).
 * Limit    = many groups on one 5k-customer page (concurrency 50).
 * Also times filter-delete (one-shot) and mixed (delete then replace).
 *
 * Writes run inside a rolled-back transaction. Seed is isolated (plangrp).
 *
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeReplaceGroupFanout.ts
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeReplaceGroupFanout.ts --groups 1,100,1000
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeReplaceGroupFanout.ts --explain
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeReplaceGroupFanout.ts --cleanup
 */

import {
	AllowanceType,
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildAddCandidateRowsQuery } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { deleteCustomerEntitlementRows } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsForPage/deleteCustomerEntitlementRows.js";
import {
	buildRemoveCandidateRowsQuery,
	selectRemoveCandidateRows,
} from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";
import {
	applyReplacePatches,
	type ReplaceRow,
} from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsForPage/applyReplacePatches.js";
import {
	buildReplaceCandidateRowsQuery,
	selectReplaceCandidateRows,
} from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsForPage/selectReplaceCandidateRows.js";
import { groupFilterReplaceRows } from "@/internal/migrations/v2/batchOperations/actions/utils/groupFilterReplaceRows.js";
import { BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { generateId } from "@/utils/genUtils.js";
import { getBenchContext } from "../utils/benchContext.js";
import {
	BENCH_PLANREP_PREFIXES,
	ensureBenchPlanItemProduct,
} from "../utils/seedBenchPlanItems.js";

const PREFIXES = {
	productId: "bench-plangrp",
	customerId: "bench-plangrp-c-",
	internalCustomer: "cus_bench_plangrp_",
	customerProduct: "cp_bench_plangrp_",
	entitlement: "ce_bench_plangrp_",
	wordsEntitlement: "ce_bench_plangrp_w_",
	fromEntitlement: "ent_bench_plangrp_from_",
	wordsFromEntitlement: "ent_bench_plangrp_words_",
	toEntitlement: "ent_bench_plangrp_to",
};

const PAGE_SIZE = 5000;
const TO_ALLOWANCE = 10_000;
const APPROX_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const groups = (get("--groups") ?? "1,10,100,1000")
		.split(",")
		.map((value) => Number(value.trim()))
		.filter((value) => value > 0);
	return {
		customers: Number(get("--customers") ?? String(PAGE_SIZE)),
		groups,
		cleanup: args.includes("--cleanup"),
		explain: args.includes("--explain"),
	};
};

const printPlan = ({ title, plan }: { title: string; plan: unknown }) => {
	const rows = (
		Array.isArray(plan) ? plan : ((plan as { rows?: unknown[] }).rows ?? [])
	) as Record<string, string>[];
	console.log("");
	console.log(`── ${title} ${"─".repeat(Math.max(58 - title.length, 0))}`);
	for (const row of rows) {
		console.log(Object.values(row)[0]);
	}
};

const explainMs = (plan: unknown): number | undefined => {
	const rows = (
		Array.isArray(plan) ? plan : ((plan as { rows?: unknown[] }).rows ?? [])
	) as Record<string, string>[];
	for (const row of rows) {
		const line = Object.values(row)[0];
		const match = /Execution Time: ([0-9.]+) ms/.exec(line);
		if (match) return Number(match[1]);
	}
	return undefined;
};

const cleanupFanout = async ({ db }: { db: DrizzleCli }) => {
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE id LIKE ${`${PREFIXES.entitlement}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_products
		WHERE id LIKE ${`${PREFIXES.customerProduct}%`}
	`);
	await db.execute(sql`
		DELETE FROM customers
		WHERE internal_id LIKE ${`${PREFIXES.internalCustomer}%`}
	`);
	await db.execute(sql`
		DELETE FROM entitlements
		WHERE id LIKE ${`${PREFIXES.fromEntitlement}%`}
			OR id LIKE ${`${PREFIXES.wordsFromEntitlement}%`}
			OR id = ${PREFIXES.toEntitlement}
	`);
};

const seedFanout = async ({
	db,
	orgId,
	env,
	internalProductId,
	internalFeatureId,
	featureId,
	wordsInternalFeatureId,
	wordsFeatureId,
	customers,
	groupCount,
	startsAt,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	internalProductId: string;
	internalFeatureId: string;
	featureId: string;
	wordsInternalFeatureId: string;
	wordsFeatureId: string;
	customers: number;
	groupCount: number;
	startsAt: number;
}) => {
	await db.execute(sql`
		INSERT INTO entitlements (
			id, created_at, org_id, internal_product_id, internal_feature_id,
			feature_id, allowance_type, allowance, interval, interval_count, is_custom
		)
		SELECT
			${PREFIXES.fromEntitlement} || i,
			${startsAt},
			${orgId},
			${internalProductId},
			${internalFeatureId},
			${featureId},
			${AllowanceType.Fixed},
			10 + i,
			${EntInterval.Month},
			1,
			true
		FROM GENERATE_SERIES(1, ${groupCount}) AS i
		ON CONFLICT (id) DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO entitlements (
			id, created_at, org_id, internal_product_id, internal_feature_id,
			feature_id, allowance_type, allowance, interval, interval_count, is_custom
		)
		VALUES (
			${PREFIXES.toEntitlement},
			${startsAt},
			${orgId},
			${internalProductId},
			${internalFeatureId},
			${featureId},
			${AllowanceType.Fixed},
			${TO_ALLOWANCE},
			${EntInterval.Month},
			1,
			true
		)
		ON CONFLICT (id) DO NOTHING
	`);

	const series = sql`GENERATE_SERIES(1, ${customers}) AS i`;
	await db.execute(sql`
		INSERT INTO customers (
			internal_id, id, org_id, env, created_at, name, email
		)
		SELECT
			${PREFIXES.internalCustomer} || i,
			${PREFIXES.customerId} || i,
			${orgId},
			${env},
			${startsAt},
			'bench plan grp',
			''
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);
	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, created_at, status,
			starts_at, is_custom, product_id, customer_id, options
		)
		SELECT
			${PREFIXES.customerProduct} || i,
			${PREFIXES.internalCustomer} || i,
			${internalProductId},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			${PREFIXES.productId},
			${PREFIXES.customerId} || i,
			'{}'::jsonb[]
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, customer_id, unlimited, balance,
			created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
			separate_interval, adjustment, additional_balance, cache_version
		)
		SELECT
			${PREFIXES.entitlement} || i,
			${PREFIXES.customerProduct} || i,
			${PREFIXES.fromEntitlement} || ((i - 1) % ${groupCount} + 1),
			${PREFIXES.internalCustomer} || i,
			${internalFeatureId},
			${featureId},
			${PREFIXES.customerId} || i,
			false,
			40,
			${startsAt},
			${startsAt},
			${startsAt} + ${APPROX_MONTH_MS}::bigint,
			false,
			false,
			0,
			0,
			0
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO entitlements (
			id, created_at, org_id, internal_product_id, internal_feature_id,
			feature_id, allowance_type, allowance, interval, interval_count, is_custom
		)
		SELECT
			${PREFIXES.wordsFromEntitlement} || i,
			${startsAt},
			${orgId},
			${internalProductId},
			${wordsInternalFeatureId},
			${wordsFeatureId},
			${AllowanceType.Fixed},
			50 + i,
			${EntInterval.Month},
			1,
			true
		FROM GENERATE_SERIES(1, ${groupCount}) AS i
		ON CONFLICT (id) DO NOTHING
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, customer_id, unlimited, balance,
			created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
			separate_interval, adjustment, additional_balance, cache_version
		)
		SELECT
			${PREFIXES.wordsEntitlement} || i,
			${PREFIXES.customerProduct} || i,
			${PREFIXES.wordsFromEntitlement} || ((i - 1) % ${groupCount} + 1),
			${PREFIXES.internalCustomer} || i,
			${wordsInternalFeatureId},
			${wordsFeatureId},
			${PREFIXES.customerId} || i,
			false,
			40,
			${startsAt},
			${startsAt},
			${startsAt} + ${APPROX_MONTH_MS}::bigint,
			false,
			false,
			0,
			0,
			0
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);
};

const main = async () => {
	const { customers, groups, cleanup, explain } = parseArgs();
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;
	const messages = ctx.features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	const words = ctx.features.find((feature) => feature.id === TestFeature.Words);
	if (!messages || !words) throw new Error("bench: messages/words missing");

	const cleanupStarted = Date.now();
	await cleanupFanout({ db });
	console.log(`probe: cleanup ${Date.now() - cleanupStarted}ms`);
	if (cleanup) process.exit(0);

	const { internalProductId } = await ensureBenchPlanItemProduct({
		db,
		orgId: org.id,
		env: ctx.env,
		internalFeatureId: messages.internal_id,
		featureId: TestFeature.Messages,
		productId: PREFIXES.productId,
		name: "Bench Plan Group Fanout",
		allowance: 100,
	});
	const scope = buildOperationScope({
		internalProductId,
		isCustom: false,
	});
	const filter = {
		feature_id: TestFeature.Messages,
		interval: EntInterval.Month,
		interval_count: 1,
	};

	const leftoverPage = (
		await db.execute<{ internal_id: string }>(sql`
			SELECT internal_id FROM customers
			WHERE internal_id LIKE ${`${BENCH_PLANREP_PREFIXES.internalCustomer}%`}
			ORDER BY internal_id
			LIMIT ${PAGE_SIZE}
		`)
	).map((row) => row.internal_id);

	if (leftoverPage.length > 0) {
		const leftoverEntitlement = (
			await db.execute<{ entitlement_id: string }>(sql`
				SELECT ce.entitlement_id
				FROM customer_entitlements ce
				WHERE ce.id LIKE ${`${BENCH_PLANREP_PREFIXES.entitlement}%`}
				LIMIT 1
			`)
		)[0]?.entitlement_id;
		if (leftoverEntitlement) {
			const leftoverPlan = await db.execute(sql`
				EXPLAIN (ANALYZE, BUFFERS)
				${buildReplaceCandidateRowsQuery({
					internalCustomerIds: leftoverPage,
					scope: buildOperationScope({
						internalProductId: (
							await db.execute<{ internal_product_id: string }>(sql`
								SELECT internal_product_id FROM customer_products
								WHERE id LIKE ${`${BENCH_PLANREP_PREFIXES.customerProduct}%`}
								LIMIT 1
							`)
						)[0].internal_product_id,
						isCustom: false,
					}),
					entitlement: {
						id: leftoverEntitlement,
						interval: EntInterval.Month,
						interval_count: 1,
						internal_feature_id: messages.internal_id,
						feature: messages,
					} as EntitlementWithFeature,
					filter,
					excludeEntitlementId: "ent_bench_exclude_none",
					features: ctx.features,
					includeAnchorSources: true,
					limit: 10_000,
				})}
			`);
			printPlan({
				title: `replace SELECT leftover planrep n=${leftoverPage.length}`,
				plan: leftoverPlan,
			});
		}
	} else {
		console.log("probe: no leftover bench-plan-replace rows — skip 5k leftover EXPLAIN");
	}

	const toEntitlement = {
		id: PREFIXES.toEntitlement,
		created_at: Date.now(),
		org_id: org.id,
		internal_product_id: internalProductId,
		internal_feature_id: messages.internal_id,
		feature_id: TestFeature.Messages,
		allowance_type: AllowanceType.Fixed,
		allowance: TO_ALLOWANCE,
		interval: EntInterval.Month,
		interval_count: 1,
		is_custom: true,
		feature: messages,
	} as EntitlementWithFeature;

	const wordsEntitlement = {
		id: generateId("ent"),
		interval: EntInterval.Month,
		interval_count: 1,
		internal_feature_id: words.internal_id,
		feature_id: words.id,
		feature: words,
	} as EntitlementWithFeature;

	for (const groupCount of groups) {
		console.log("");
		console.log(
			`══ groups=${groupCount} customers=${customers} concurrency=${BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY} ${"═".repeat(12)}`,
		);

		await cleanupFanout({ db });
		const seedStarted = Date.now();
		await seedFanout({
			db,
			orgId: org.id,
			env: ctx.env,
			internalProductId,
			internalFeatureId: messages.internal_id,
			featureId: TestFeature.Messages,
			wordsInternalFeatureId: words.internal_id,
			wordsFeatureId: TestFeature.Words,
			customers,
			groupCount,
			startsAt: Date.now(),
		});
		await db.execute(sql`ANALYZE customer_entitlements`);
		await db.execute(sql`ANALYZE entitlements`);
		console.log(`probe: seed+analyze ${Date.now() - seedStarted}ms`);

		const pageCustomers = (
			await db.execute<{ internal_id: string }>(sql`
				SELECT internal_id FROM customers
				WHERE internal_id LIKE ${`${PREFIXES.internalCustomer}%`}
				ORDER BY internal_id
				LIMIT ${customers}
			`)
		).map((row) => row.internal_id);

		const replaceQuery = buildReplaceCandidateRowsQuery({
			internalCustomerIds: pageCustomers,
			scope,
			entitlement: toEntitlement,
			filter,
			excludeEntitlementId: PREFIXES.toEntitlement,
			features: ctx.features,
			includeAnchorSources: true,
			limit: 10_000,
		});
		const replaceExplain = await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS) ${replaceQuery}`,
		);
		if (explain) {
			printPlan({
				title: `replace SELECT groups=${groupCount}`,
				plan: replaceExplain,
			});
		}

		const addQuery = buildAddCandidateRowsQuery({
			internalCustomerIds: pageCustomers,
			scope,
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
			limit: 10_000,
		});
		const addExplain = await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS) ${addQuery}`,
		);
		if (explain) {
			printPlan({
				title: `add SELECT (words already live → skip) groups=${groupCount}`,
				plan: addExplain,
			});
		}

		const wordsFilter = {
			feature_id: TestFeature.Words,
			interval: EntInterval.Month,
			interval_count: 1,
		};
		const deleteQuery = buildRemoveCandidateRowsQuery({
			internalCustomerIds: pageCustomers,
			scope,
			filter: wordsFilter,
			limit: 10_000,
		});
		const deleteExplain = await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS) ${deleteQuery}`,
		);
		if (explain) {
			printPlan({
				title: `delete SELECT groups=${groupCount}`,
				plan: deleteExplain,
			});
		}

		const selectStarted = Date.now();
		const candidates = await selectReplaceCandidateRows({
			db,
			internalCustomerIds: pageCustomers,
			scope,
			entitlement: toEntitlement,
			filter,
			excludeEntitlementId: PREFIXES.toEntitlement,
			features: ctx.features,
			includeAnchorSources: true,
			limit: 10_000,
		});
		const selectMs = Date.now() - selectStarted;

		const groupStarted = Date.now();
		const grouped = groupFilterReplaceRows({
			rows: candidates.map(
				(candidate): ReplaceRow => ({
					...candidate,
					resetCycleAnchor: candidate.liveNextResetAt,
					nextResetAt: candidate.liveNextResetAt,
				}),
			),
			toEntitlement,
		});
		const groupMs = Date.now() - groupStarted;

		let replaceMs = 0;
		let updated = 0;
		try {
			await db.transaction(async (tx) => {
				const replaceStarted = Date.now();
				const patched = await mapWithConcurrency({
					items: grouped,
					concurrency: BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY,
					run: (group) =>
						applyReplacePatches({
							db: tx as unknown as DrizzleCli,
							rows: group.rows,
							scope,
							toEntitlement,
							customerEntitlementPatch: group.patch,
						}),
				});
				replaceMs = Date.now() - replaceStarted;
				updated = patched.reduce((sum, result) => sum + result.rows, 0);
				throw new Error("probe: intentional rollback");
			});
		} catch (error) {
			if (!(error instanceof Error && error.message.includes("intentional"))) {
				throw error;
			}
		}

		const waves = Math.ceil(
			grouped.length / BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY,
		);
		console.log(
			`probe: replace select ${selectMs}ms (${candidates.length} rows)  group ${groupMs}ms (${grouped.length} groups, ${waves} waves)  apply ${replaceMs}ms (${updated} updates)  page ${selectMs + groupMs + replaceMs}ms`,
		);
		console.log(
			`probe: EXPLAIN replace ${explainMs(replaceExplain) ?? "?"}ms  add ${explainMs(addExplain) ?? "?"}ms  delete ${explainMs(deleteExplain) ?? "?"}ms`,
		);

		const removeSelectStarted = Date.now();
		const removeCandidates = await selectRemoveCandidateRows({
			db,
			internalCustomerIds: pageCustomers,
			scope,
			filter: wordsFilter,
			features: ctx.features,
			limit: 10_000,
		});
		const removeSelectMs = Date.now() - removeSelectStarted;

		let deleteMs = 0;
		let deleted = 0;
		try {
			await db.transaction(async (tx) => {
				const deleteStarted = Date.now();
				const ids = await deleteCustomerEntitlementRows({
					db: tx as unknown as DrizzleCli,
					customerEntitlementIds: removeCandidates.map(
						(row) => row.customerEntitlementId,
					),
					scope,
				});
				deleteMs = Date.now() - deleteStarted;
				deleted = ids.length;
				throw new Error("probe: intentional rollback");
			});
		} catch (error) {
			if (!(error instanceof Error && error.message.includes("intentional"))) {
				throw error;
			}
		}
		console.log(
			`probe: delete select ${removeSelectMs}ms (${removeCandidates.length} rows)  delete ${deleteMs}ms (${deleted} rows, 1 statement)`,
		);

		let mixedMs = 0;
		try {
			await db.transaction(async (tx) => {
				const mixedStarted = Date.now();
				await deleteCustomerEntitlementRows({
					db: tx as unknown as DrizzleCli,
					customerEntitlementIds: removeCandidates.map(
						(row) => row.customerEntitlementId,
					),
					scope,
				});
				await mapWithConcurrency({
					items: grouped,
					concurrency: BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY,
					run: (group) =>
						applyReplacePatches({
							db: tx as unknown as DrizzleCli,
							rows: group.rows,
							scope,
							toEntitlement,
							customerEntitlementPatch: group.patch,
						}),
				});
				mixedMs = Date.now() - mixedStarted;
				throw new Error("probe: intentional rollback");
			});
		} catch (error) {
			if (!(error instanceof Error && error.message.includes("intentional"))) {
				throw error;
			}
		}
		console.log(
			`probe: mixed (delete words + replace messages ${grouped.length} groups) ${mixedMs}ms`,
		);
	}

	await cleanupFanout({ db });
	process.exit(0);
};

await main();
