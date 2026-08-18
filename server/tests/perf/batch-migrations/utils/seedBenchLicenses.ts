import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	BENCH_CUSTOMER_ID_PREFIX,
	BENCH_CUSTOMER_PRODUCT_PREFIX,
	BENCH_INTERNAL_CUSTOMER_PREFIX,
} from "./benchContext.js";

export const BENCH_LICENSE_LINK_PREFIX = "cus_lic_link_bench_";
export const BENCH_CUSTOMER_LICENSE_PREFIX = "cus_lic_bench_";
export const BENCH_ASSIGNMENT_PREFIX = "cp_bench_seat_";
export const BENCH_SEAT_ENTITLEMENT_PREFIX = "ce_bench_seat_";
export const BENCH_ENTITY_PREFIX = "ety_bench_";

/**
 * Seeds one pool per bench customer plus `assignmentsPerCustomer` entity-scoped
 * assignments under it — the shape a license customize migration fans out to.
 * Pools start on the catalog link so a bench run measures the real repoint.
 */
export const seedBenchLicenses = async ({
	db,
	count,
	assignmentsPerCustomer,
	licenseInternalProductId,
	licenseProductId,
	catalogPlanLicenseId,
	startsAt,
	orgId,
	env,
	existingEntitlement,
}: {
	db: DrizzleCli;
	count: number;
	assignmentsPerCustomer: number;
	licenseInternalProductId: string;
	licenseProductId: string;
	catalogPlanLicenseId: string;
	startsAt: number;
	orgId: string;
	env: string;
	/** Plants a row on every assignment so a supersede has something to repoint. */
	existingEntitlement?: {
		entitlementId: string;
		internalFeatureId: string;
		featureId: string;
		balance: number;
	};
}) => {
	const series = sql`GENERATE_SERIES(1, ${count}) AS i`;

	await db.execute(sql`
		INSERT INTO customer_licenses (
			id, link_id, internal_customer_id, parent_customer_product_id,
			license_internal_product_id, plan_license_id, granted, remaining,
			paid_quantity, created_at, updated_at
		)
		SELECT
			${BENCH_CUSTOMER_LICENSE_PREFIX} || i,
			${BENCH_LICENSE_LINK_PREFIX} || i,
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_CUSTOMER_PRODUCT_PREFIX} || i,
			${licenseInternalProductId},
			${catalogPlanLicenseId},
			${assignmentsPerCustomer},
			0,
			0,
			${startsAt},
			${startsAt}
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	// Entities first: assignments are entity-scoped by definition.
	await db.execute(sql`
		INSERT INTO entities (
			id, internal_id, internal_customer_id, name, internal_feature_id,
			feature_id, created_at, env, org_id, deleted
		)
		SELECT
			${BENCH_ENTITY_PREFIX} || i || '_' || s,
			${BENCH_ENTITY_PREFIX} || i || '_' || s,
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			'bench seat',
			NULL,
			NULL,
			${startsAt},
			${env},
			${orgId},
			false
		FROM ${series}, GENERATE_SERIES(1, ${assignmentsPerCustomer}) AS s
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, created_at, status,
			starts_at, is_custom, product_id, customer_id,
			customer_license_link_id, internal_entity_id, options
		)
		SELECT
			${BENCH_ASSIGNMENT_PREFIX} || i || '_' || s,
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${licenseInternalProductId},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			${licenseProductId},
			${BENCH_CUSTOMER_ID_PREFIX} || i,
			${BENCH_LICENSE_LINK_PREFIX} || i,
			${BENCH_ENTITY_PREFIX} || i || '_' || s,
			'{}'::jsonb[]
		FROM ${series}, GENERATE_SERIES(1, ${assignmentsPerCustomer}) AS s
		ON CONFLICT DO NOTHING
	`);

	if (!existingEntitlement) return;

	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, internal_customer_id, customer_id,
			internal_entity_id, entitlement_id, internal_feature_id, feature_id,
			balance, created_at
		)
		SELECT
			${BENCH_SEAT_ENTITLEMENT_PREFIX} || i || '_' || s,
			${BENCH_ASSIGNMENT_PREFIX} || i || '_' || s,
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_CUSTOMER_ID_PREFIX} || i,
			${BENCH_ENTITY_PREFIX} || i || '_' || s,
			${existingEntitlement.entitlementId},
			${existingEntitlement.internalFeatureId},
			${existingEntitlement.featureId},
			${existingEntitlement.balance},
			${startsAt}
		FROM ${series}, GENERATE_SERIES(1, ${assignmentsPerCustomer}) AS s
		ON CONFLICT DO NOTHING
	`);
};
