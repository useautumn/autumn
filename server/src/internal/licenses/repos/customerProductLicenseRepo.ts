import {
	type AppEnv,
	customerProductLicenses,
	customerProducts,
	type DbCustomerProductLicense,
	type InsertCustomerProductLicense,
} from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const listByParentCustomerProductIds = async ({
	db,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	parentCustomerProductIds: string[];
}) =>
	await db.query.customerProductLicenses.findMany({
		where: inArray(
			customerProductLicenses.parent_customer_product_id,
			parentCustomerProductIds,
		),
	});

const listByParentCustomerProductId = async ({
	db,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
}) =>
	await db.query.customerProductLicenses.findMany({
		where: eq(
			customerProductLicenses.parent_customer_product_id,
			parentCustomerProductId,
		),
	});

const deleteByIds = async ({ db, ids }: { db: DrizzleCli; ids: string[] }) => {
	await db
		.delete(customerProductLicenses)
		.where(inArray(customerProductLicenses.id, ids));
};

const upsert = async ({
	db,
	orgId,
	env,
	id,
	parentCustomerProductId,
	licenseInternalProductId,
	includedQuantity,
	allowExtraQuantity,
	pooledFeatureIds,
	customize,
	metadata,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	id: string;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
	includedQuantity: number;
	allowExtraQuantity: boolean;
	pooledFeatureIds: string[];
	customize: InsertCustomerProductLicense["customize"];
	metadata: InsertCustomerProductLicense["metadata"];
}): Promise<DbCustomerProductLicense[]> =>
	await db
		.insert(customerProductLicenses)
		.values({
			id,
			org_id: orgId,
			env,
			parent_customer_product_id: parentCustomerProductId,
			license_internal_product_id: licenseInternalProductId,
			included_quantity: includedQuantity,
			allow_extra_quantity: allowExtraQuantity,
			pooled_feature_ids: pooledFeatureIds,
			customize,
			metadata,
			created_at: Date.now(),
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				customerProductLicenses.parent_customer_product_id,
				customerProductLicenses.license_internal_product_id,
			],
			set: {
				included_quantity: includedQuantity,
				allow_extra_quantity: allowExtraQuantity,
				pooled_feature_ids: pooledFeatureIds,
				customize,
				metadata,
				updated_at: Date.now(),
			},
		})
		.returning();

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

const markParentLicenseSetCustomized = async ({
	db,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
}) => {
	await db
		.update(customerProducts)
		.set({ license_set_customized: true, updated_at: Date.now() })
		.where(eq(customerProducts.id, parentCustomerProductId));
};

export const customerProductLicenseRepo = {
	listByParentCustomerProductIds,
	listByParentCustomerProductId,
	deleteByIds,
	upsert,
	getParentCustomerProductById,
	markParentLicenseSetCustomized,
} as const;
