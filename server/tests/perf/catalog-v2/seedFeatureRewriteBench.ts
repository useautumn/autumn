/**
 * Seeds the catalogV2 rewrite bench org with FEATURE_REWRITE_ROW_LIMIT
 * granting entitlements, entity_feature_id entitlements, and usage prices —
 * the worst-case volume the execute path is allowed to rewrite in one call.
 *
 * Pure server-side inserts — no API/Stripe. Reruns are resumable
 * (delete+reseed when --reset).
 *
 *   bun tests/perf/catalog-v2/seedFeatureRewriteBench.ts
 *   bun tests/perf/catalog-v2/seedFeatureRewriteBench.ts --reset
 */

import {
	AllowanceType,
	BillWhen,
	BillingInterval,
	EntInterval,
	entitlements,
	FeatureType,
	FeatureUsageType,
	features,
	Infinite,
	prices,
	products,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import { generateId } from "@/utils/genUtils.js";
import {
	assertBenchDatabaseSafe,
	FEATURE_REWRITE_BENCH_ENV,
	FEATURE_REWRITE_BENCH_FEATURE_ID,
	FEATURE_REWRITE_BENCH_PRODUCT_ID,
	FEATURE_REWRITE_BENCH_ROW_COUNT,
	getFeatureRewriteBenchContext,
} from "./utils/featureRewriteBenchContext.js";

const CARRIER_FEATURE_ID = `${FEATURE_REWRITE_BENCH_FEATURE_ID}_carrier`;

const parseArgs = () => ({
	reset: process.argv.includes("--reset"),
	rows: Number(
		process.argv.includes("--rows")
			? process.argv[process.argv.indexOf("--rows") + 1]
			: FEATURE_REWRITE_BENCH_ROW_COUNT,
	),
});

const main = async () => {
	assertBenchDatabaseSafe();
	const { reset, rows } = parseArgs();
	if (rows > FEATURE_REWRITE_ROW_LIMIT) {
		console.warn(
			`warn: seeding ${rows} rows (> FEATURE_REWRITE_ROW_LIMIT=${FEATURE_REWRITE_ROW_LIMIT}); execute path rejects overflow in prod`,
		);
	}

	const { ctx, org } = await getFeatureRewriteBenchContext();
	const { db } = ctx;

	if (reset) {
		console.log("reset: wiping bench entitlements/prices/features/products…");
		await db.execute(sql`
			DELETE FROM prices
			WHERE org_id = ${org.id}
				AND internal_product_id IN (
					SELECT internal_id FROM products
					WHERE org_id = ${org.id} AND env = ${FEATURE_REWRITE_BENCH_ENV}
						AND id = ${FEATURE_REWRITE_BENCH_PRODUCT_ID}
				)
		`);
		await db.execute(sql`
			DELETE FROM entitlements
			WHERE org_id = ${org.id}
				AND internal_product_id IN (
					SELECT internal_id FROM products
					WHERE org_id = ${org.id} AND env = ${FEATURE_REWRITE_BENCH_ENV}
						AND id = ${FEATURE_REWRITE_BENCH_PRODUCT_ID}
				)
		`);
		await db
			.delete(features)
			.where(
				and(
					eq(features.org_id, org.id),
					eq(features.env, FEATURE_REWRITE_BENCH_ENV),
				),
			);
		await db
			.delete(products)
			.where(
				and(
					eq(products.org_id, org.id),
					eq(products.env, FEATURE_REWRITE_BENCH_ENV),
					eq(products.id, FEATURE_REWRITE_BENCH_PRODUCT_ID),
				),
			);
	}

	let [product] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, org.id),
				eq(products.env, FEATURE_REWRITE_BENCH_ENV),
				eq(products.id, FEATURE_REWRITE_BENCH_PRODUCT_ID),
			),
		)
		.limit(1);

	if (!product) {
		const internalId = generateId("prod");
		await db.insert(products).values({
			internal_id: internalId,
			id: FEATURE_REWRITE_BENCH_PRODUCT_ID,
			org_id: org.id,
			env: FEATURE_REWRITE_BENCH_ENV,
			name: "CatalogV2 Rewrite Bench",
			created_at: Date.now(),
			version: 1,
		});
		[product] = await db
			.select()
			.from(products)
			.where(eq(products.internal_id, internalId))
			.limit(1);
	}

	const ensureFeature = async ({
		featureId,
		name,
	}: {
		featureId: string;
		name: string;
	}) => {
		const [existing] = await db
			.select()
			.from(features)
			.where(
				and(
					eq(features.org_id, org.id),
					eq(features.env, FEATURE_REWRITE_BENCH_ENV),
					eq(features.id, featureId),
				),
			)
			.limit(1);
		if (existing) return existing;

		const internalId = generateId("fe");
		await db.insert(features).values({
			internal_id: internalId,
			org_id: org.id,
			env: FEATURE_REWRITE_BENCH_ENV,
			created_at: Date.now(),
			id: featureId,
			name,
			type: FeatureType.Metered,
			config: {
				filters: [],
				aggregate: { type: "sum", property: "value" },
				usage_type: FeatureUsageType.Single,
			},
			archived: false,
			event_names: [],
			model_markups: null,
		});
		const [created] = await db
			.select()
			.from(features)
			.where(eq(features.internal_id, internalId))
			.limit(1);
		return created;
	};

	const benchFeature = await ensureFeature({
		featureId: FEATURE_REWRITE_BENCH_FEATURE_ID,
		name: "Rewrite Bench Feature",
	});
	const carrierFeature = await ensureFeature({
		featureId: CARRIER_FEATURE_ID,
		name: "Rewrite Bench Carrier",
	});

	const [{ count: grantingCount }] = await db.execute<{ count: string }>(sql`
		SELECT count(*)::text AS count
		FROM entitlements
		WHERE internal_feature_id = ${benchFeature.internal_id}
			AND org_id = ${org.id}
	`);
	const existingGranting = Number(grantingCount);

	if (existingGranting >= rows) {
		console.log(
			`already seeded: ${existingGranting} granting ents (≥ ${rows}). Use --reset to wipe.`,
		);
	} else {
		const toInsert = rows - existingGranting;
		console.log(
			`seeding ${toInsert} granting + entity ents + prices (target ${rows})…`,
		);
		const now = Date.now();
		const chunk = 200;
		for (let offset = 0; offset < toInsert; offset += chunk) {
			const n = Math.min(chunk, toInsert - offset);
			const indexes = Array.from({ length: n }, (_, i) => existingGranting + offset + i);

			await db.insert(entitlements).values(
				indexes.flatMap((index) => [
					{
						id: `cv2_rw_bench_ent_g_${index}`,
						created_at: now,
						org_id: org.id,
						internal_product_id: product.internal_id,
						internal_feature_id: benchFeature.internal_id,
						feature_id: FEATURE_REWRITE_BENCH_FEATURE_ID,
						allowance_type: AllowanceType.Fixed,
						allowance: 100,
						interval: EntInterval.Month,
						interval_count: 1,
					},
					{
						id: `cv2_rw_bench_ent_e_${index}`,
						created_at: now,
						org_id: org.id,
						internal_product_id: product.internal_id,
						internal_feature_id: carrierFeature.internal_id,
						feature_id: CARRIER_FEATURE_ID,
						allowance_type: AllowanceType.Fixed,
						allowance: 1,
						interval: EntInterval.Month,
						interval_count: 1,
						entity_feature_id: FEATURE_REWRITE_BENCH_FEATURE_ID,
					},
				]),
			);

			await db.insert(prices).values(
				indexes.map((index) => ({
					id: `cv2_rw_bench_pr_${index}`,
					org_id: org.id,
					internal_product_id: product.internal_id,
					created_at: now,
					config: {
						type: "usage",
						bill_when: BillWhen.EndOfPeriod,
						billing_units: 1,
						internal_feature_id: benchFeature.internal_id,
						feature_id: FEATURE_REWRITE_BENCH_FEATURE_ID,
						usage_tiers: [{ to: Infinite as "inf", amount: 0.01 }],
						interval: BillingInterval.Month,
						interval_count: 1,
						should_prorate: false,
						stripe_price_id: `price_bench_${index}`,
					},
				})),
			);
		}
	}

	console.log(
		JSON.stringify(
			{
				orgId: org.id,
				orgSlug: org.slug,
				env: FEATURE_REWRITE_BENCH_ENV,
				featureId: FEATURE_REWRITE_BENCH_FEATURE_ID,
				internalFeatureId: benchFeature.internal_id,
				internalProductId: product.internal_id,
				rows,
			},
			null,
			2,
		),
	);

	process.exit(0);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
