import {
	customerEntitlements,
	type DbLicensePoolGrant,
	type InsertLicensePoolGrant,
	licensePoolGrants,
} from "@autumn/shared";
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const getForUpdateByNaturalKey = async ({
	db,
	internalCustomerId,
	parentCustomerProductId,
	licenseInternalProductId,
	internalFeatureId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
	internalFeatureId: string;
}): Promise<DbLicensePoolGrant | undefined> => {
	const [grant] = await db
		.select()
		.from(licensePoolGrants)
		.where(
			and(
				eq(licensePoolGrants.internal_customer_id, internalCustomerId),
				eq(
					licensePoolGrants.parent_customer_product_id,
					parentCustomerProductId,
				),
				eq(
					licensePoolGrants.license_internal_product_id,
					licenseInternalProductId,
				),
				eq(licensePoolGrants.internal_feature_id, internalFeatureId),
			),
		)
		.for("update");

	return grant;
};

const insertIgnoringDuplicate = async ({
	db,
	grant,
}: {
	db: DrizzleCli;
	grant: InsertLicensePoolGrant;
}): Promise<DbLicensePoolGrant | undefined> => {
	const [inserted] = await db
		.insert(licensePoolGrants)
		.values(grant)
		.onConflictDoNothing({
			target: [
				licensePoolGrants.internal_customer_id,
				licensePoolGrants.parent_customer_product_id,
				licensePoolGrants.license_internal_product_id,
				licensePoolGrants.internal_feature_id,
			],
		})
		.returning();

	return inserted;
};

const findOrphanForAdoption = async ({
	db,
	internalCustomerId,
	licenseInternalProductId,
	internalFeatureId,
	activeParentIds,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	licenseInternalProductId: string;
	internalFeatureId: string;
	activeParentIds: string[];
}): Promise<DbLicensePoolGrant | undefined> => {
	const [orphan] = await db
		.select()
		.from(licensePoolGrants)
		.where(
			and(
				eq(licensePoolGrants.internal_customer_id, internalCustomerId),
				eq(
					licensePoolGrants.license_internal_product_id,
					licenseInternalProductId,
				),
				eq(licensePoolGrants.internal_feature_id, internalFeatureId),
				activeParentIds.length > 0
					? notInArray(
							licensePoolGrants.parent_customer_product_id,
							activeParentIds,
						)
					: undefined,
			),
		)
		.orderBy(desc(licensePoolGrants.updated_at))
		.limit(1)
		.for("update");

	return orphan;
};

const updateParent = async ({
	db,
	grantId,
	parentCustomerProductId,
	updatedAt,
}: {
	db: DrizzleCli;
	grantId: string;
	parentCustomerProductId: string;
	updatedAt: number;
}) => {
	await db
		.update(licensePoolGrants)
		.set({
			parent_customer_product_id: parentCustomerProductId,
			updated_at: updatedAt,
		})
		.where(eq(licensePoolGrants.id, grantId));
};

const updateMarker = async ({
	db,
	grantId,
	periodGrantedAllowance,
	periodKey,
	updatedAt,
	customerEntitlementId,
}: {
	db: DrizzleCli;
	grantId: string;
	periodGrantedAllowance: number;
	periodKey: number | null;
	updatedAt: number;
	customerEntitlementId?: string;
}) => {
	await db
		.update(licensePoolGrants)
		.set({
			period_granted_allowance: periodGrantedAllowance,
			period_key: periodKey,
			updated_at: updatedAt,
			...(customerEntitlementId !== undefined
				? { customer_entitlement_id: customerEntitlementId }
				: {}),
		})
		.where(eq(licensePoolGrants.id, grantId));
};

const getCustomerEntitlementById = async ({
	db,
	customerEntitlementId,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
}) => {
	// Locked so a concurrent reset can't advance next_reset_at between this
	// read and the period-marker write.
	const [customerEntitlement] = await db
		.select()
		.from(customerEntitlements)
		.where(eq(customerEntitlements.id, customerEntitlementId))
		.for("update");

	return customerEntitlement;
};

export const licensePoolGrantRepo = {
	getForUpdateByNaturalKey,
	findOrphanForAdoption,
	updateParent,
	insertIgnoringDuplicate,
	updateMarker,
	getCustomerEntitlementById,
} as const;
