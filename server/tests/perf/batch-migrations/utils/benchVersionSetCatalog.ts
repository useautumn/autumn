/**
 * Catalog for the version-set bench: one parent plan at v1 and v2 whose diff
 * is 3 replaces / 2 deletes / 2 adds, linked to two license plans.
 *
 * Ids are deterministic so reruns are idempotent and every row is cleanable by
 * prefix. The v2 links mirror copyPlanLicensesToNewVersion: new plan_license
 * rows against the SAME license_internal_product_id, identical included /
 * prepaid_only / metadata, so resolvePlanLicenseTransitions emits a pool
 * repoint per link instead of rejecting the patch.
 */

import {
	AllowanceType,
	EntInterval,
	entitlements,
	type Feature,
	products,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";

export const BENCH_VERSET_PLAN_ID = "bench-verset";

/** Features whose allowance changes v1 → v2 (replace ops). */
export const BENCH_VERSET_REPLACED_FEATURES = [
	TestFeature.Messages,
	TestFeature.Users,
	TestFeature.Workflows,
];
/** Present in v1 only (remove ops). */
export const BENCH_VERSET_DELETED_FEATURES = [
	TestFeature.Admin,
	TestFeature.AdminRights,
];
/** Present in v2 only (add ops). */
export const BENCH_VERSET_ADDED_FEATURES = [
	TestFeature.Words,
	TestFeature.Storage,
];

export const BENCH_VERSET_V1_ALLOWANCE = 100;
export const BENCH_VERSET_V2_ALLOWANCE = 200;
/** Seats each link includes; identical across versions by design. */
export const BENCH_VERSET_INCLUDED_SEATS = 2;

const BENCH_VERSET_LICENSE_KEYS = ["a", "b"] as const;

/** Every license child carries the same item shape as the parent's v1 half, so
 * a customize pass can replace three, drop two and add two. */
export const BENCH_VERSET_LICENSE_FEATURES = [
	...BENCH_VERSET_REPLACED_FEATURES,
	...BENCH_VERSET_DELETED_FEATURES,
];

export const BENCH_VERSET_PRODUCT_PREFIX = "prod_bench_verset_";
export const BENCH_VERSET_ENTITLEMENT_PREFIX = "ent_bench_verset_";
export const BENCH_VERSET_PLAN_LICENSE_PREFIX = "plan_lic_bench_verset_";

export type BenchVersionSetLicense = {
	licensePlanId: string;
	licenseInternalProductId: string;
	v1PlanLicenseId: string;
	v2PlanLicenseId: string;
	/** Child's own entitlement ids, keyed by feature id. */
	entitlementIdsByFeature: Map<string, string>;
};

export type BenchVersionSetCatalog = {
	planId: string;
	v1InternalProductId: string;
	v2InternalProductId: string;
	/** v1 rows are what customers get seeded onto. */
	v1EntitlementIdsByFeature: Map<string, string>;
	v2EntitlementIdsByFeature: Map<string, string>;
	licenses: BenchVersionSetLicense[];
};

const internalFeatureIdOrThrow = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string;
}) => {
	const feature = features.find((candidate) => candidate.id === featureId);
	if (!feature) {
		throw new Error(
			`bench: the bench org is missing feature ${featureId} — seed features first`,
		);
	}
	return feature.internal_id;
};

const ensureProductVersion = async ({
	db,
	orgId,
	env,
	internalId,
	productId,
	name,
	version,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	internalId: string;
	productId: string;
	name: string;
	version: number;
}) => {
	const [existing] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.internal_id, internalId),
			),
		)
		.limit(1);
	if (existing) return existing.internal_id;

	await db.insert(products).values({
		internal_id: internalId,
		id: productId,
		org_id: orgId,
		env,
		name,
		created_at: Date.now(),
		version,
	});
	return internalId;
};

/** Idempotent by deterministic id, and re-asserts allowance so a rerun after
 * an edited constant still lands the intended shape. */
const ensureEntitlement = async ({
	db,
	orgId,
	id,
	internalProductId,
	internalFeatureId,
	featureId,
	allowance,
}: {
	db: DrizzleCli;
	orgId: string;
	id: string;
	internalProductId: string;
	internalFeatureId: string;
	featureId: string;
	allowance: number;
}) => {
	await db
		.insert(entitlements)
		.values({
			id,
			created_at: Date.now(),
			org_id: orgId,
			internal_product_id: internalProductId,
			internal_feature_id: internalFeatureId,
			feature_id: featureId,
			allowance_type: AllowanceType.Fixed,
			allowance,
			interval: EntInterval.Month,
			interval_count: 1,
		})
		.onConflictDoUpdate({
			target: entitlements.id,
			set: { allowance },
		});
	return id;
};

const ensureEntitlementSet = async ({
	db,
	orgId,
	features,
	internalProductId,
	idStem,
	featureIds,
	allowance,
}: {
	db: DrizzleCli;
	orgId: string;
	features: Feature[];
	internalProductId: string;
	idStem: string;
	featureIds: string[];
	allowance: number;
}) => {
	const byFeature = new Map<string, string>();
	for (const featureId of featureIds) {
		const id = await ensureEntitlement({
			db,
			orgId,
			id: `${BENCH_VERSET_ENTITLEMENT_PREFIX}${idStem}_${featureId}`,
			internalProductId,
			internalFeatureId: internalFeatureIdOrThrow({ features, featureId }),
			featureId,
			allowance,
		});
		byFeature.set(featureId, id);
	}
	return byFeature;
};

export const ensureBenchVersionSetCatalog = async ({
	db,
	orgId,
	env,
	features,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	features: Feature[];
}): Promise<BenchVersionSetCatalog> => {
	const v1InternalProductId = `${BENCH_VERSET_PRODUCT_PREFIX}v1`;
	const v2InternalProductId = `${BENCH_VERSET_PRODUCT_PREFIX}v2`;

	await ensureProductVersion({
		db,
		orgId,
		env,
		internalId: v1InternalProductId,
		productId: BENCH_VERSET_PLAN_ID,
		name: "Bench Version Set",
		version: 1,
	});
	await ensureProductVersion({
		db,
		orgId,
		env,
		internalId: v2InternalProductId,
		productId: BENCH_VERSET_PLAN_ID,
		name: "Bench Version Set",
		version: 2,
	});

	const v1EntitlementIdsByFeature = new Map([
		...(await ensureEntitlementSet({
			db,
			orgId,
			features,
			internalProductId: v1InternalProductId,
			idStem: "v1",
			featureIds: BENCH_VERSET_REPLACED_FEATURES,
			allowance: BENCH_VERSET_V1_ALLOWANCE,
		})),
		...(await ensureEntitlementSet({
			db,
			orgId,
			features,
			internalProductId: v1InternalProductId,
			idStem: "v1",
			featureIds: BENCH_VERSET_DELETED_FEATURES,
			allowance: BENCH_VERSET_V1_ALLOWANCE,
		})),
	]);

	const v2EntitlementIdsByFeature = new Map([
		...(await ensureEntitlementSet({
			db,
			orgId,
			features,
			internalProductId: v2InternalProductId,
			idStem: "v2",
			featureIds: BENCH_VERSET_REPLACED_FEATURES,
			allowance: BENCH_VERSET_V2_ALLOWANCE,
		})),
		...(await ensureEntitlementSet({
			db,
			orgId,
			features,
			internalProductId: v2InternalProductId,
			idStem: "v2",
			featureIds: BENCH_VERSET_ADDED_FEATURES,
			allowance: BENCH_VERSET_V1_ALLOWANCE,
		})),
	]);

	const licenses: BenchVersionSetLicense[] = [];
	for (const key of BENCH_VERSET_LICENSE_KEYS) {
		const licensePlanId = `${BENCH_VERSET_PLAN_ID}-lic-${key}`;
		const licenseInternalProductId = `${BENCH_VERSET_PRODUCT_PREFIX}lic_${key}`;

		await ensureProductVersion({
			db,
			orgId,
			env,
			internalId: licenseInternalProductId,
			productId: licensePlanId,
			name: `Bench Version Set License ${key.toUpperCase()}`,
			version: 1,
		});
		const entitlementIdsByFeature = await ensureEntitlementSet({
			db,
			orgId,
			features,
			internalProductId: licenseInternalProductId,
			idStem: `lic_${key}`,
			featureIds: BENCH_VERSET_LICENSE_FEATURES,
			allowance: BENCH_VERSET_V1_ALLOWANCE,
		});

		const [v1Link, v2Link] = await Promise.all(
			[
				{ parent: v1InternalProductId, suffix: "v1" },
				{ parent: v2InternalProductId, suffix: "v2" },
			].map(({ parent, suffix }) =>
				planLicenseRepo.upsert({
					db,
					id: `${BENCH_VERSET_PLAN_LICENSE_PREFIX}${suffix}_${key}`,
					parentInternalProductId: parent,
					licenseInternalProductId,
					included: BENCH_VERSET_INCLUDED_SEATS,
					prepaidOnly: false,
					metadata: {},
				}),
			),
		);

		licenses.push({
			licensePlanId,
			licenseInternalProductId,
			v1PlanLicenseId: v1Link.id,
			v2PlanLicenseId: v2Link.id,
			entitlementIdsByFeature,
		});
	}

	return {
		planId: BENCH_VERSET_PLAN_ID,
		v1InternalProductId,
		v2InternalProductId,
		v1EntitlementIdsByFeature,
		v2EntitlementIdsByFeature,
		licenses,
	};
};

/** Drops only the version-set catalog rows; customer rows are the seeder's. */
export const deleteBenchVersionSetCatalog = async ({
	db,
}: {
	db: DrizzleCli;
}) => {
	await db.execute(
		sql`DELETE FROM plan_license WHERE id LIKE ${`${BENCH_VERSET_PLAN_LICENSE_PREFIX}%`}`,
	);
	await db.execute(
		sql`DELETE FROM entitlements WHERE id LIKE ${`${BENCH_VERSET_ENTITLEMENT_PREFIX}%`}`,
	);
	await db.execute(
		sql`DELETE FROM products WHERE internal_id LIKE ${`${BENCH_VERSET_PRODUCT_PREFIX}%`}`,
	);
};
