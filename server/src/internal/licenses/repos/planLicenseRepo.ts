import {
	type AppEnv,
	type DbPlanLicense,
	type LicenseCustomize,
	planLicenses,
	products,
} from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const licenseProducts = alias(products, "license_products");

const upsert = async ({
	db,
	orgId,
	env,
	id,
	parentInternalProductId,
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
	parentInternalProductId: string;
	licenseInternalProductId: string;
	includedQuantity: number;
	allowExtraQuantity: boolean;
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
			license_internal_product_id: licenseInternalProductId,
			included_quantity: includedQuantity,
			allow_extra_quantity: allowExtraQuantity,
			pooled_feature_ids: pooledFeatureIds,
			customize: customize ?? null,
			metadata: metadata ?? {},
			created_at: Date.now(),
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				planLicenses.parent_internal_product_id,
				planLicenses.license_internal_product_id,
			],
			set: {
				included_quantity: includedQuantity,
				allow_extra_quantity: allowExtraQuantity,
				pooled_feature_ids: pooledFeatureIds,
				...(customize !== undefined ? { customize } : {}),
				...(metadata !== undefined ? { metadata } : {}),
				updated_at: Date.now(),
			},
		})
		.returning();

	return planLicense;
};

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
			eq(planLicenses.parent_internal_product_id, parentInternalProductId),
		);

const listByParentInternalProductIds = async ({
	db,
	parentInternalProductIds,
}: {
	db: DrizzleCli;
	parentInternalProductIds: string[];
}) =>
	await db.query.planLicenses.findMany({
		where: inArray(
			planLicenses.parent_internal_product_id,
			parentInternalProductIds,
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

export const planLicenseRepo = {
	upsert,
	listWithLicensePlanIdByParent,
	listByParentInternalProductIds,
	listByLicenseInternalProductId,
} as const;
