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
const parentProducts = alias(products, "parent_products");

const upsert = async ({
	db,
	id = generateId("plan_lic"),
	parentInternalProductId,
	parentCustomerProductId = null,
	licenseInternalProductId,
	included,
	prepaidOnly,
	metadata,
}: {
	db: DrizzleCli;
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
				isNull(planLicenses.parent_customer_product_id),
			),
		);
	return rows.map(({ row }) => row);
};

/** Distinct parent plan (public) ids holding catalog links to any version of
 * the given license plan — the one-to-one ownership lookup. */
const listCatalogParentPlanIdsByLicensePlanId = async ({
	db,
	orgId,
	env,
	licensePlanId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	licensePlanId: string;
}): Promise<string[]> => {
	const rows = await db
		.selectDistinct({ parentPlanId: parentProducts.id })
		.from(planLicenses)
		.innerJoin(
			licenseProducts,
			eq(planLicenses.license_internal_product_id, licenseProducts.internal_id),
		)
		.innerJoin(
			parentProducts,
			eq(planLicenses.parent_internal_product_id, parentProducts.internal_id),
		)
		.where(
			and(
				eq(licenseProducts.id, licensePlanId),
				eq(licenseProducts.org_id, orgId),
				eq(licenseProducts.env, env),
				isNull(planLicenses.parent_customer_product_id),
			),
		);
	return rows.map((row) => row.parentPlanId);
};

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
	listCatalogByLicenseInternalProductIds,
	listCustomerByParentCustomerProductIds,
	listWithLicensePlanIdByParents,
	listCatalogParentPlanIdsByLicensePlanId,
	listCatalogByOrgEnv,
	deleteByIds,
	listProductsByInternalIds,
	getParentCustomerProductById,
} as const;
