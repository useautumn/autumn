/**
 * Seeds customers onto the version-set plan's v1: one customer product, one
 * row per v1 item, and one license pool per link. Assignments (entity-scoped
 * rows under a pool) are opt-in because only the license-entitlement ops touch
 * them, and they multiply row counts by assignments × license items.
 *
 * Server-side generate_series only, chunked and resumable via ON CONFLICT DO
 * NOTHING, so a partial run can be re-driven.
 */

import { CusProductStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BenchVersionSetCatalog } from "./benchVersionSetCatalog.js";

export const BENCH_VERSET_CUSTOMER_ID_PREFIX = "bench-verset-c-";
export const BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX = "cus_bench_verset_";
export const BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX = "cp_bench_verset_";
export const BENCH_VERSET_ROW_PREFIX = "ce_bench_verset_";
export const BENCH_VERSET_CUSTOMER_LICENSE_PREFIX = "cuslic_bench_verset_";
export const BENCH_VERSET_LICENSE_LINK_PREFIX = "cuslink_bench_verset_";
/** Distinct stems so counting parent rows never matches assignment rows. */
export const BENCH_VERSET_ASSIGNMENT_PREFIX = "cpseat_bench_verset_";
export const BENCH_VERSET_SEAT_ROW_PREFIX = "ceseat_bench_verset_";
export const BENCH_VERSET_ENTITY_PREFIX = "ety_bench_verset_";

const APPROX_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** (entitlement_id, internal_feature_id, feature_id) triples as a VALUES list,
 * cross-joined against the customer series to fan one row out per item. */
const itemDefinitionsSql = ({
	entitlementIdsByFeature,
	internalFeatureIdsByFeature,
}: {
	entitlementIdsByFeature: Map<string, string>;
	internalFeatureIdsByFeature: Map<string, string>;
}): SQL => {
	const rows = [...entitlementIdsByFeature.entries()].map(
		([featureId, entitlementId]) => {
			const internalFeatureId = internalFeatureIdsByFeature.get(featureId);
			if (!internalFeatureId) {
				throw new Error(`bench: no internal feature id for ${featureId}`);
			}
			return sql`(${entitlementId}, ${internalFeatureId}, ${featureId})`;
		},
	);
	return sql`(VALUES ${sql.join(rows, sql`, `)}) AS def(entitlement_id, internal_feature_id, feature_id)`;
};

const licenseDefinitionsSql = ({
	catalog,
}: {
	catalog: BenchVersionSetCatalog;
}): SQL => {
	const rows = catalog.licenses.map(
		(license, index) =>
			sql`(${String(index)}, ${license.v1PlanLicenseId}, ${license.licenseInternalProductId}, ${license.licensePlanId})`,
	);
	return sql`(VALUES ${sql.join(rows, sql`, `)}) AS lic(key, plan_license_id, license_internal_product_id, license_plan_id)`;
};

const seedChunk = async ({
	db,
	catalog,
	internalFeatureIdsByFeature,
	orgId,
	env,
	start,
	end,
	startsAt,
	balance,
	includedSeats,
	assignmentsPerCustomer,
}: {
	db: DrizzleCli;
	catalog: BenchVersionSetCatalog;
	internalFeatureIdsByFeature: Map<string, string>;
	orgId: string;
	env: string;
	start: number;
	end: number;
	startsAt: number;
	balance: number;
	includedSeats: number;
	assignmentsPerCustomer: number;
}) => {
	const series = sql`GENERATE_SERIES(${start}::int, ${end}::int) AS g(i)`;
	const items = itemDefinitionsSql({
		entitlementIdsByFeature: catalog.v1EntitlementIdsByFeature,
		internalFeatureIdsByFeature,
	});
	const licenseDefs = licenseDefinitionsSql({ catalog });

	await db.execute(sql`
		INSERT INTO customers (internal_id, id, org_id, env, created_at, name, email)
		SELECT
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_VERSET_CUSTOMER_ID_PREFIX} || i,
			${orgId},
			${env},
			${startsAt},
			'bench verset ' || i,
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
			${BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX} || i,
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			${catalog.v1InternalProductId},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			${catalog.planId},
			${BENCH_VERSET_CUSTOMER_ID_PREFIX} || i,
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
			${BENCH_VERSET_ROW_PREFIX} || i || '_' || def.feature_id,
			${BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX} || i,
			def.entitlement_id,
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			def.internal_feature_id,
			def.feature_id,
			${BENCH_VERSET_CUSTOMER_ID_PREFIX} || i,
			false,
			${balance},
			${startsAt},
			${startsAt},
			${startsAt} + ${APPROX_MONTH_MS}::bigint,
			false,
			false,
			0,
			0,
			0
		FROM ${series}
		CROSS JOIN ${items}
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO customer_licenses (
			id, link_id, internal_customer_id, parent_customer_product_id,
			license_internal_product_id, plan_license_id, granted, remaining,
			paid_quantity, created_at, updated_at
		)
		SELECT
			${BENCH_VERSET_CUSTOMER_LICENSE_PREFIX} || i || '_' || lic.key,
			${BENCH_VERSET_LICENSE_LINK_PREFIX} || i || '_' || lic.key,
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX} || i,
			lic.license_internal_product_id,
			lic.plan_license_id,
			${includedSeats},
			${Math.max(includedSeats - assignmentsPerCustomer, 0)},
			0,
			${startsAt},
			${startsAt}
		FROM ${series}
		CROSS JOIN ${licenseDefs}
		ON CONFLICT DO NOTHING
	`);

	if (assignmentsPerCustomer === 0) return;

	const seats = sql`GENERATE_SERIES(1, ${assignmentsPerCustomer}::int) AS s`;

	await db.execute(sql`
		INSERT INTO entities (
			id, internal_id, internal_customer_id, name, internal_feature_id,
			feature_id, created_at, env, org_id, deleted
		)
		SELECT
			${BENCH_VERSET_ENTITY_PREFIX} || i || '_' || lic.key || '_' || s,
			${BENCH_VERSET_ENTITY_PREFIX} || i || '_' || lic.key || '_' || s,
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			'bench verset seat',
			NULL,
			NULL,
			${startsAt},
			${env},
			${orgId},
			false
		FROM ${series}
		CROSS JOIN ${licenseDefs}
		CROSS JOIN ${seats}
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, created_at, status,
			starts_at, is_custom, product_id, customer_id,
			customer_license_link_id, internal_entity_id, options
		)
		SELECT
			${BENCH_VERSET_ASSIGNMENT_PREFIX} || i || '_' || lic.key || '_' || s,
			${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
			lic.license_internal_product_id,
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			lic.license_plan_id,
			${BENCH_VERSET_CUSTOMER_ID_PREFIX} || i,
			${BENCH_VERSET_LICENSE_LINK_PREFIX} || i || '_' || lic.key,
			${BENCH_VERSET_ENTITY_PREFIX} || i || '_' || lic.key || '_' || s,
			'{}'::jsonb[]
		FROM ${series}
		CROSS JOIN ${licenseDefs}
		CROSS JOIN ${seats}
		ON CONFLICT DO NOTHING
	`);

	// Each license child carries its own item set, so a seat holds one row per
	// license feature — this is the term that dominates row growth.
	for (const [index, license] of catalog.licenses.entries()) {
		const licenseItems = itemDefinitionsSql({
			entitlementIdsByFeature: license.entitlementIdsByFeature,
			internalFeatureIdsByFeature,
		});
		await db.execute(sql`
			INSERT INTO customer_entitlements (
				id, customer_product_id, entitlement_id, internal_customer_id,
				internal_entity_id, internal_feature_id, feature_id, customer_id,
				unlimited, balance, created_at, reset_cycle_anchor, next_reset_at,
				usage_allowed, separate_interval, adjustment, additional_balance,
				cache_version
			)
			SELECT
				${BENCH_VERSET_SEAT_ROW_PREFIX} || i || '_' || ${String(index)} || '_' || s || '_' || def.feature_id,
				${BENCH_VERSET_ASSIGNMENT_PREFIX} || i || '_' || ${String(index)} || '_' || s,
				def.entitlement_id,
				${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX} || i,
				${BENCH_VERSET_ENTITY_PREFIX} || i || '_' || ${String(index)} || '_' || s,
				def.internal_feature_id,
				def.feature_id,
				${BENCH_VERSET_CUSTOMER_ID_PREFIX} || i,
				false,
				${balance},
				${startsAt},
				${startsAt},
				${startsAt} + ${APPROX_MONTH_MS}::bigint,
				false,
				false,
				0,
				0,
				0
			FROM ${series}
			CROSS JOIN ${licenseItems}
			CROSS JOIN ${seats}
			ON CONFLICT DO NOTHING
		`);
	}
};

export const seedBenchVersionSet = async ({
	db,
	catalog,
	features,
	orgId,
	env,
	count,
	chunk = 50_000,
	startsAt = Date.now(),
	balance,
	includedSeats,
	assignmentsPerCustomer,
}: {
	db: DrizzleCli;
	catalog: BenchVersionSetCatalog;
	features: Array<{ id: string; internal_id: string }>;
	orgId: string;
	env: string;
	count: number;
	chunk?: number;
	startsAt?: number;
	balance: number;
	includedSeats: number;
	assignmentsPerCustomer: number;
}) => {
	const internalFeatureIdsByFeature = new Map(
		features.map((feature) => [feature.id, feature.internal_id]),
	);

	for (let start = 1; start <= count; start += chunk) {
		const end = Math.min(start + chunk - 1, count);
		const chunkStarted = Date.now();
		await seedChunk({
			db,
			catalog,
			internalFeatureIdsByFeature,
			orgId,
			env,
			start,
			end,
			startsAt,
			balance,
			includedSeats,
			assignmentsPerCustomer,
		});
		console.log(
			`bench:   seeded ${end.toLocaleString()}/${count.toLocaleString()} (${Date.now() - chunkStarted}ms)`,
		);
	}
};

/** Prior claims collide with the live-item exclusion on replay, so a rerun
 * must clear them even when it reuses the seeded rows. */
export const deleteBenchVersionSetClaims = async ({
	db,
}: {
	db: DrizzleCli;
}) => {
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE item_id LIKE ${`${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX}%`}`,
	);
};

export const deleteBenchVersionSetCustomers = async ({
	db,
}: {
	db: DrizzleCli;
}) => {
	const internalPrefix = `${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX}%`;
	await db.execute(
		sql`DELETE FROM customer_entitlements WHERE internal_customer_id LIKE ${internalPrefix}`,
	);
	await db.execute(
		sql`DELETE FROM customer_licenses WHERE internal_customer_id LIKE ${internalPrefix}`,
	);
	await db.execute(
		sql`DELETE FROM customer_products WHERE internal_customer_id LIKE ${internalPrefix}`,
	);
	await db.execute(
		sql`DELETE FROM entities WHERE internal_customer_id LIKE ${internalPrefix}`,
	);
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE item_id LIKE ${internalPrefix}`,
	);
	await db.execute(
		sql`DELETE FROM customers WHERE internal_id LIKE ${internalPrefix}`,
	);
};
