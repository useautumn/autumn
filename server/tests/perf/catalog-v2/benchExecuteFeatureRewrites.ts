/**
 * Worst-case timing for catalogV2 feature reference rewrites on the seeded
 * DEV bench org (FEATURE_REWRITE_ROW_LIMIT granting + entity ents + prices).
 *
 *   bun tests/perf/catalog-v2/seedFeatureRewriteBench.ts --reset
 *   bun tests/perf/catalog-v2/benchExecuteFeatureRewrites.ts
 *
 * Budget: executeFeatureReferenceRewrites (one multi-CTE stmt) < 500ms.
 * Also times FeatureService.update (id flip) so the full executeUpdateFeatures
 * hot path is visible.
 */

import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	features,
	prices,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { executeFeatureReferenceRewrites } from "@/internal/catalogV2/execute/executeFeatureReferenceRewrites.js";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import {
	assertBenchDatabaseSafe,
	FEATURE_REWRITE_BENCH_ENV,
	FEATURE_REWRITE_BENCH_FEATURE_ID,
	getFeatureRewriteBenchContext,
} from "./utils/featureRewriteBenchContext.js";

const BUDGET_MS = 500;
const RENAMED_ID = `${FEATURE_REWRITE_BENCH_FEATURE_ID}__renamed`;

const time = async <T>(label: string, fn: () => Promise<T>): Promise<{
	result: T;
	ms: number;
}> => {
	const start = performance.now();
	const result = await fn();
	const ms = performance.now() - start;
	console.log(`${label.padEnd(48)} ${ms.toFixed(1)}ms`);
	return { result, ms };
};

const loadBenchFeature = async ({
	db,
	orgId,
	featureId,
}: {
	db: Awaited<ReturnType<typeof getFeatureRewriteBenchContext>>["ctx"]["db"];
	orgId: string;
	featureId: string;
}) => {
	const [feature] = await db
		.select()
		.from(features)
		.where(
			and(
				eq(features.org_id, orgId),
				eq(features.env, FEATURE_REWRITE_BENCH_ENV),
				eq(features.id, featureId),
			),
		)
		.limit(1);
	if (!feature) {
		throw new Error(
			`bench feature ${featureId} missing — run seedFeatureRewriteBench.ts first`,
		);
	}
	return feature;
};

const countGranting = async ({
	db,
	internalFeatureId,
}: {
	db: Awaited<ReturnType<typeof getFeatureRewriteBenchContext>>["ctx"]["db"];
	internalFeatureId: string;
}) => {
	const [{ count }] = await db.execute<{ count: string }>(sql`
		SELECT count(*)::text AS count
		FROM entitlements
		WHERE internal_feature_id COLLATE "C" = ${internalFeatureId}
	`);
	return Number(count);
};

const restorePublicIds = async ({
	db,
	orgId,
	internalFeatureId,
	fromId,
	toId,
}: {
	db: Awaited<ReturnType<typeof getFeatureRewriteBenchContext>>["ctx"]["db"];
	orgId: string;
	internalFeatureId: string;
	fromId: string;
	toId: string;
}) => {
	await db.execute(sql`
		WITH granting AS (
			SELECT entitlement.id
			FROM entitlements AS entitlement
			INNER JOIN features AS feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.internal_feature_id COLLATE "C" = ${internalFeatureId}
				AND feature.org_id = ${orgId}
				AND feature.env = ${FEATURE_REWRITE_BENCH_ENV}
		),
		entity_scoped AS (
			SELECT entitlement.id
			FROM entitlements AS entitlement
			INNER JOIN features AS feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.entity_feature_id = ${fromId}
				AND feature.org_id = ${orgId}
				AND feature.env = ${FEATURE_REWRITE_BENCH_ENV}
		),
		upd_entity AS (
			UPDATE entitlements
			SET entity_feature_id = ${toId}
			WHERE id IN (SELECT id FROM entity_scoped)
			RETURNING 1
		),
		upd_granting AS (
			UPDATE entitlements
			SET feature_id = ${toId}
			WHERE id IN (SELECT id FROM granting)
			RETURNING 1
		),
		upd_prices AS (
			UPDATE prices
			SET config = jsonb_set(config, '{feature_id}', to_jsonb(${toId}::text), true)
			WHERE org_id = ${orgId}
				AND config ->> 'internal_feature_id' = ${internalFeatureId}
			RETURNING 1
		)
		SELECT 1
	`);

	await FeatureService.update({
		db,
		id: fromId,
		orgId,
		env: FEATURE_REWRITE_BENCH_ENV,
		updates: { id: toId },
	});
};

const main = async () => {
	assertBenchDatabaseSafe();
	const { ctx, org } = await getFeatureRewriteBenchContext();
	const { db } = ctx;

	let feature = await loadBenchFeature({
		db,
		orgId: org.id,
		featureId: FEATURE_REWRITE_BENCH_FEATURE_ID,
	}).catch(async () =>
		loadBenchFeature({ db, orgId: org.id, featureId: RENAMED_ID }),
	);

	// Normalize to the stable public id so the bench is idempotent
	if (feature.id === RENAMED_ID) {
		console.log("restoring renamed feature id before bench…");
		await restorePublicIds({
			db,
			orgId: org.id,
			internalFeatureId: feature.internal_id!,
			fromId: RENAMED_ID,
			toId: FEATURE_REWRITE_BENCH_FEATURE_ID,
		});
		feature = await loadBenchFeature({
			db,
			orgId: org.id,
			featureId: FEATURE_REWRITE_BENCH_FEATURE_ID,
		});
	}

	const grantingRows = await countGranting({
		db,
		internalFeatureId: feature.internal_id!,
	});
	const [{ count: priceCount }] = await db.execute<{ count: string }>(sql`
		SELECT count(*)::text AS count
		FROM prices
		WHERE org_id = ${org.id}
			AND config ->> 'internal_feature_id' = ${feature.internal_id}
	`);
	console.log(
		`fixture: ${grantingRows} granting ents, ${priceCount} prices (limit ${FEATURE_REWRITE_ROW_LIMIT})`,
	);
	if (grantingRows < FEATURE_REWRITE_ROW_LIMIT) {
		throw new Error(
			`seed incomplete (${grantingRows} < ${FEATURE_REWRITE_ROW_LIMIT}) — run seedFeatureRewriteBench.ts`,
		);
	}

	const current = {
		...feature,
		created_at: feature.created_at ?? Date.now(),
		env: FEATURE_REWRITE_BENCH_ENV,
		name: feature.name ?? FEATURE_REWRITE_BENCH_FEATURE_ID,
		type: feature.type as FeatureType,
		event_names: feature.event_names ?? [],
		config: feature.config ?? {
			filters: [],
			aggregate: { type: "sum" as const, property: "value" },
			usage_type: FeatureUsageType.Single,
		},
	} as Feature;

	const updateFeaturePlan: UpdateFeaturePlan = {
		current,
		next: { ...current, id: RENAMED_ID },
		previousAttributes: { id: FEATURE_REWRITE_BENCH_FEATURE_ID },
		hasCustomerEntitlements: false,
		regenerateDisplay: false,
		clearCreditSystemCache: false,
		rewrites: {
			typeChange: null,
			idChange: {
				fromId: FEATURE_REWRITE_BENCH_FEATURE_ID,
				toId: RENAMED_ID,
			},
			usageTypeChange: null,
			updateCreditSystemSchemas: [],
		},
	};

	// Warm connection / plans
	await db.execute(sql`SELECT 1`);

	const { ms: rewriteMs } = await time(
		"executeFeatureReferenceRewrites (id rename)",
		() => executeFeatureReferenceRewrites({ ctx, updateFeaturePlan }),
	);

	const { ms: featureUpdateMs } = await time(
		"FeatureService.update (flip feature.id)",
		() =>
			FeatureService.update({
				db,
				id: FEATURE_REWRITE_BENCH_FEATURE_ID,
				orgId: org.id,
				env: FEATURE_REWRITE_BENCH_ENV,
				updates: { id: RENAMED_ID },
			}),
	);

	// Spot-check a price actually flipped
	const [samplePrice] = await db
		.select()
		.from(prices)
		.where(
			and(
				eq(prices.org_id, org.id),
				sql`config ->> 'internal_feature_id' = ${feature.internal_id}`,
			),
		)
		.limit(1);
	const sampleFeatureId = (
		samplePrice?.config as { feature_id?: string } | null
	)?.feature_id;
	if (sampleFeatureId !== RENAMED_ID) {
		throw new Error(
			`expected price.feature_id=${RENAMED_ID}, got ${sampleFeatureId}`,
		);
	}

	console.log("restoring fixture for next run…");
	await restorePublicIds({
		db,
		orgId: org.id,
		internalFeatureId: feature.internal_id!,
		fromId: RENAMED_ID,
		toId: FEATURE_REWRITE_BENCH_FEATURE_ID,
	});

	console.log(
		JSON.stringify(
			{
				rewriteMs: Number(rewriteMs.toFixed(1)),
				featureUpdateMs: Number(featureUpdateMs.toFixed(1)),
				combinedHotPathMs: Number((rewriteMs + featureUpdateMs).toFixed(1)),
				budgetMs: BUDGET_MS,
				pass: rewriteMs < BUDGET_MS,
			},
			null,
			2,
		),
	);

	if (rewriteMs >= BUDGET_MS) {
		console.error(
			`FAIL: executeFeatureReferenceRewrites ${rewriteMs.toFixed(1)}ms ≥ ${BUDGET_MS}ms`,
		);
		process.exit(1);
	}

	process.exit(0);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
