import {
	type AppEnv,
	customerProductLicenses,
	customerProducts,
	type InsertLicensePool,
	licensePools,
	planLicenses,
	products,
} from "@autumn/shared";
import { and, arrayContains, eq, inArray, isNull, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { parentCustomerProducts } from "../licenseUtils.js";

const insertInheritedPools = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: InsertLicensePool[];
}) => {
	await db
		.insert(licensePools)
		.values(rows)
		.onConflictDoNothing({
			target: [
				licensePools.parent_customer_product_id,
				licensePools.plan_license_id,
			],
		});
};

const insertCustomPools = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: InsertLicensePool[];
}) => {
	await db
		.insert(licensePools)
		.values(rows)
		.onConflictDoNothing({
			target: [
				licensePools.parent_customer_product_id,
				licensePools.customer_product_license_id,
			],
		});
};

const listByParentCustomerProductIds = async ({
	db,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	parentCustomerProductIds: string[];
}) =>
	await db.query.licensePools.findMany({
		where: inArray(
			licensePools.parent_customer_product_id,
			parentCustomerProductIds,
		),
	});

const listCustomPoolsByParentAndLicenseIds = async ({
	db,
	parentCustomerProductId,
	customerProductLicenseIds,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
	customerProductLicenseIds: string[];
}) =>
	await db.query.licensePools.findMany({
		where: and(
			eq(licensePools.parent_customer_product_id, parentCustomerProductId),
			inArray(
				licensePools.customer_product_license_id,
				customerProductLicenseIds,
			),
		),
	});

const deleteInheritedByParentCustomerProductId = async ({
	db,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
}) => {
	await db
		.delete(licensePools)
		.where(
			and(
				eq(licensePools.parent_customer_product_id, parentCustomerProductId),
				isNull(licensePools.customer_product_license_id),
			),
		);
};

const listAssignablePoolRows = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	licenseInternalProductId,
	poolId,
	parentSubscriptionId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	licenseInternalProductId: string;
	poolId?: string;
	parentSubscriptionId?: string;
}) =>
	await db
		.select({
			pool: licensePools,
			planLicense: planLicenses,
			customerProductLicense: customerProductLicenses,
			paidCustomerProduct: customerProducts,
			parentCustomerProduct: parentCustomerProducts,
		})
		.from(licensePools)
		.innerJoin(
			parentCustomerProducts,
			eq(licensePools.parent_customer_product_id, parentCustomerProducts.id),
		)
		.leftJoin(planLicenses, eq(licensePools.plan_license_id, planLicenses.id))
		.leftJoin(
			customerProductLicenses,
			eq(licensePools.customer_product_license_id, customerProductLicenses.id),
		)
		.leftJoin(
			customerProducts,
			eq(licensePools.license_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(licensePools.org_id, orgId),
				eq(licensePools.env, env),
				eq(licensePools.internal_customer_id, internalCustomerId),
				eq(licensePools.license_internal_product_id, licenseInternalProductId),
				poolId ? eq(licensePools.id, poolId) : undefined,
				parentSubscriptionId
					? or(
							eq(licensePools.parent_customer_product_id, parentSubscriptionId),
							eq(parentCustomerProducts.external_id, parentSubscriptionId),
							arrayContains(parentCustomerProducts.subscription_ids, [
								parentSubscriptionId,
							]),
						)
					: undefined,
			),
		);

const listPoolRowsWithProductByCustomer = async ({
	db,
	orgId,
	env,
	internalCustomerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
}) =>
	await db
		.select({
			pool: licensePools,
			planLicense: planLicenses,
			customerProductLicense: customerProductLicenses,
			licenseProduct: products,
			parentCustomerProduct: parentCustomerProducts,
			paidCustomerProduct: customerProducts,
		})
		.from(licensePools)
		.leftJoin(planLicenses, eq(licensePools.plan_license_id, planLicenses.id))
		.leftJoin(
			customerProductLicenses,
			eq(licensePools.customer_product_license_id, customerProductLicenses.id),
		)
		.innerJoin(
			products,
			eq(licensePools.license_internal_product_id, products.internal_id),
		)
		.innerJoin(
			parentCustomerProducts,
			eq(licensePools.parent_customer_product_id, parentCustomerProducts.id),
		)
		.leftJoin(
			customerProducts,
			eq(licensePools.license_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(licensePools.org_id, orgId),
				eq(licensePools.env, env),
				eq(licensePools.internal_customer_id, internalCustomerId),
			),
		);

const listPoolRowsByCustomer = async ({
	db,
	orgId,
	env,
	internalCustomerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
}) =>
	await db
		.select({
			pool: licensePools,
			planLicense: planLicenses,
			customerProductLicense: customerProductLicenses,
			parentCustomerProduct: parentCustomerProducts,
			paidCustomerProduct: customerProducts,
		})
		.from(licensePools)
		.leftJoin(planLicenses, eq(licensePools.plan_license_id, planLicenses.id))
		.leftJoin(
			customerProductLicenses,
			eq(licensePools.customer_product_license_id, customerProductLicenses.id),
		)
		.innerJoin(
			parentCustomerProducts,
			eq(licensePools.parent_customer_product_id, parentCustomerProducts.id),
		)
		.leftJoin(
			customerProducts,
			eq(licensePools.license_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(licensePools.org_id, orgId),
				eq(licensePools.env, env),
				eq(licensePools.internal_customer_id, internalCustomerId),
			),
		);

export const licensePoolRepo = {
	insertInheritedPools,
	insertCustomPools,
	listByParentCustomerProductIds,
	listCustomPoolsByParentAndLicenseIds,
	deleteInheritedByParentCustomerProductId,
	listAssignablePoolRows,
	listPoolRowsWithProductByCustomer,
	listPoolRowsByCustomer,
} as const;
