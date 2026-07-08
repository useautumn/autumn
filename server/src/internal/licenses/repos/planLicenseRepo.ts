import {
	type AppEnv,
	customerProducts,
	type DbPlanLicense,
	planLicenses,
	products,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const licenseProducts = alias(products, "license_products");

const upsert = async ({
	db,
	orgId,
	env,
	id = generateId("plan_lic"),
	parentInternalProductId,
	parentCustomerProductId = null,
	licenseInternalProductId,
	included,
	prepaidOnly,
	metadata,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	id?: string;
	parentInternalProductId: string;
	parentCustomerProductId?: string | null;
	licenseInternalProductId: string;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
}): Promise<DbPlanLicense> => {
	const [planLicense] = await db
		.insert(planLicenses)
		.values({
			id,
			org_id: orgId,
			env,
			parent_internal_product_id: parentInternalProductId,
			parent_customer_product_id: parentCustomerProductId,
			license_internal_product_id: licenseInternalProductId,
			included,
			prepaid_only: prepaidOnly,
			metadata: metadata ?? {},
			created_at: Date.now(),
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				planLicenses.parent_internal_product_id,
				planLicenses.parent_customer_product_id,
				planLicenses.license_internal_product_id,
			],
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
			isNull(planLicenses.parent_customer_product_id),
		),
	});

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
			isNull(planLicenses.parent_customer_product_id),
		),
	});

const listCustomerByParentCustomerProductIds = async ({
	db,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	parentCustomerProductIds: string[];
}) =>
	await db.query.planLicenses.findMany({
		where: inArray(
			planLicenses.parent_customer_product_id,
			parentCustomerProductIds,
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
				isNull(planLicenses.parent_customer_product_id),
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
}) =>
	await db.query.planLicenses.findMany({
		where: and(
			eq(planLicenses.org_id, orgId),
			eq(planLicenses.env, env),
			isNull(planLicenses.parent_customer_product_id),
		),
	});

const listByLicenseInternalProductId = async ({
	db,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	licenseInternalProductId: string;
}) =>
	await db.query.planLicenses.findMany({
		where: eq(
			planLicenses.license_internal_product_id,
			licenseInternalProductId,
		),
	});

const deleteByIds = async ({ db, ids }: { db: DrizzleCli; ids: string[] }) => {
	await db.delete(planLicenses).where(inArray(planLicenses.id, ids));
};

const listProductsByInternalIds = async ({
	db,
	internalProductIds,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
}) =>
	await db.query.products.findMany({
		where: inArray(products.internal_id, internalProductIds),
	});

const getParentCustomerProductById = async ({
	db,
	customerProductId,
}: {
	db: DrizzleCli;
	customerProductId: string;
}) =>
	await db.query.customerProducts.findFirst({
		where: eq(customerProducts.id, customerProductId),
	});

export const planLicenseRepo = {
	upsert,
	getCatalogByParentAndLicense,
	listCatalogByParentInternalProductIds,
	listCustomerByParentCustomerProductIds,
	listWithLicensePlanIdByParents,
	listCatalogByOrgEnv,
	listByLicenseInternalProductId,
	deleteByIds,
	listProductsByInternalIds,
	getParentCustomerProductById,
} as const;
