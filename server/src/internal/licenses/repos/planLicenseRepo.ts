import {
	type AppEnv,
	customerLicenses,
	type DbPlanLicense,
	planLicenses,
	products,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const licenseProducts = alias(products, "license_products");

const upsert = async ({
	db,
	id = generateId("plan_lic"),
	parentInternalProductId,
	licenseInternalProductId,
	included,
	prepaidOnly,
	metadata,
}: {
	db: DrizzleCli;
	id?: string;
	parentInternalProductId: string;
	licenseInternalProductId: string;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
}): Promise<DbPlanLicense> => {
	const [planLicense] = await db
		.insert(planLicenses)
		.values({
			id,
			parent_internal_product_id: parentInternalProductId,
			license_internal_product_id: licenseInternalProductId,
			is_custom: false,
			included,
			prepaid_only: prepaidOnly,
			metadata: metadata ?? {},
			created_at: Date.now(),
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				planLicenses.parent_internal_product_id,
				planLicenses.license_internal_product_id,
			],
			targetWhere: sql`${planLicenses.is_custom} = false`,
			set: {
				included,
				prepaid_only: prepaidOnly,
				...(metadata !== undefined ? { metadata } : {}),
				updated_at: Date.now(),
			},
		})
		.returning();

	return planLicense;
};

const getCatalogByParentAndLicense = async ({
	db,
	parentInternalProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentInternalProductId: string;
	licenseInternalProductId: string;
}) =>
	await db.query.planLicenses.findFirst({
		where: and(
			eq(planLicenses.parent_internal_product_id, parentInternalProductId),
			eq(planLicenses.license_internal_product_id, licenseInternalProductId),
			eq(planLicenses.is_custom, false),
		),
	});

const retireCatalogById = async ({
	db,
	id,
}: {
	db: DrizzleCli;
	id: string;
}) => {
	const [retired] = await db
		.update(planLicenses)
		.set({ is_custom: true, updated_at: Date.now() })
		.where(and(eq(planLicenses.id, id), eq(planLicenses.is_custom, false)))
		.returning();
	return retired;
};

const listCatalogByLicenseInternalProductIds = async ({
	db,
	licenseInternalProductIds,
}: {
	db: DrizzleCli;
	licenseInternalProductIds: string[];
}) =>
	await db.query.planLicenses.findMany({
		where: and(
			inArray(
				planLicenses.license_internal_product_id,
				licenseInternalProductIds,
			),
			eq(planLicenses.is_custom, false),
		),
	});

const listCustomerReferencedByLicenseInternalProductIds = async ({
	db,
	licenseInternalProductIds,
}: {
	db: DrizzleCli;
	licenseInternalProductIds: string[];
}) => {
	if (licenseInternalProductIds.length === 0) return [];
	const rows = await db
		.selectDistinct({ planLicense: planLicenses })
		.from(planLicenses)
		.innerJoin(
			customerLicenses,
			eq(customerLicenses.plan_license_id, planLicenses.id),
		)
		.where(
			inArray(
				planLicenses.license_internal_product_id,
				licenseInternalProductIds,
			),
		);
	return rows.map(({ planLicense }) => planLicense);
};

const listCatalogByParentInternalProductIds = async ({
	db,
	parentInternalProductIds,
}: {
	db: DrizzleCli;
	parentInternalProductIds: string[];
}) =>
	await db.query.planLicenses.findMany({
		where: and(
			inArray(
				planLicenses.parent_internal_product_id,
				parentInternalProductIds,
			),
			eq(planLicenses.is_custom, false),
		),
	});

const listWithLicensePlanIdByParents = async ({
	db,
	parentInternalProductIds,
}: {
	db: DrizzleCli;
	parentInternalProductIds: string[];
}) =>
	await db
		.select({
			planLicense: planLicenses,
			licensePlanId: licenseProducts.id,
		})
		.from(planLicenses)
		.innerJoin(
			licenseProducts,
			eq(planLicenses.license_internal_product_id, licenseProducts.internal_id),
		)
		.where(
			and(
				inArray(
					planLicenses.parent_internal_product_id,
					parentInternalProductIds,
				),
				eq(planLicenses.is_custom, false),
			),
		);

const listCatalogByOrgEnv = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	const rows = await db
		.select({ row: planLicenses })
		.from(planLicenses)
		.innerJoin(
			products,
			eq(products.internal_id, planLicenses.parent_internal_product_id),
		)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(planLicenses.is_custom, false),
			),
		);
	return rows.map(({ row }) => row);
};

const listProductsByInternalIds = async ({
	db,
	orgId,
	env,
	internalProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalProductIds: string[];
}) => {
	if (internalProductIds.length === 0) return [];
	return await db
		.select({ id: products.id })
		.from(products)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				inArray(products.internal_id, internalProductIds),
			),
		);
};

const insertMany = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: DbPlanLicense[];
}): Promise<void> => {
	if (rows.length === 0) return;
	await db.insert(planLicenses).values(rows);
};

const deleteByIds = async ({ db, ids }: { db: DrizzleCli; ids: string[] }) => {
	await db.delete(planLicenses).where(inArray(planLicenses.id, ids));
};

export const planLicenseRepo = {
	upsert,
	getCatalogByParentAndLicense,
	retireCatalogById,
	listCatalogByParentInternalProductIds,
	listCatalogByLicenseInternalProductIds,
	listCustomerReferencedByLicenseInternalProductIds,
	listWithLicensePlanIdByParents,
	listCatalogByOrgEnv,
	listProductsByInternalIds,
	insertMany,
	deleteByIds,
} as const;
