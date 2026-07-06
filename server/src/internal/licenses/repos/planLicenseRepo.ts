import {
	type AppEnv,
	customerProducts,
	type DbPlanLicense,
	type LicenseCustomize,
	planLicenses,
	products,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { licensePoolParentStatuses } from "../licenseUtils.js";

const licenseProducts = alias(products, "license_products");

const upsert = async ({
	db,
	orgId,
	env,
	id,
	parentInternalProductId,
	parentCustomerProductId = null,
	licenseInternalProductId,
	included,
	prepaidOnly,
	pooledFeatureIds,
	customize,
	metadata,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	id: string;
	parentInternalProductId: string;
	parentCustomerProductId?: string | null;
	licenseInternalProductId: string;
	included: number;
	prepaidOnly: boolean;
	pooledFeatureIds: string[];
	customize?: LicenseCustomize | null;
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
			pooled_feature_ids: pooledFeatureIds,
			customize: customize ?? null,
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
				pooled_feature_ids: pooledFeatureIds,
				...(customize !== undefined ? { customize } : {}),
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

const listWithLicensePlanIdByParent = async ({
	db,
	parentInternalProductId,
}: {
	db: DrizzleCli;
	parentInternalProductId: string;
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
				eq(planLicenses.parent_internal_product_id, parentInternalProductId),
				isNull(planLicenses.parent_customer_product_id),
			),
		);

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

const existsForCustomerParents = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}) => {
	const [catalogRow] = await db
		.select({ id: planLicenses.id })
		.from(planLicenses)
		.innerJoin(
			customerProducts,
			eq(
				customerProducts.internal_product_id,
				planLicenses.parent_internal_product_id,
			),
		)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				isNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, licensePoolParentStatuses),
			),
		)
		.limit(1);
	if (catalogRow) return true;

	const [customerRow] = await db
		.select({ id: planLicenses.id })
		.from(planLicenses)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, planLicenses.parent_customer_product_id),
		)
		.where(eq(customerProducts.internal_customer_id, internalCustomerId))
		.limit(1);
	return customerRow !== undefined;
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
	listWithLicensePlanIdByParent,
	listWithLicensePlanIdByParents,
	listCatalogByOrgEnv,
	listByLicenseInternalProductId,
	deleteByIds,
	existsForCustomerParents,
	listProductsByInternalIds,
	getParentCustomerProductById,
} as const;
