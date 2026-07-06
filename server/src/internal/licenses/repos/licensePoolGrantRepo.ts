import {
	type AppEnv,
	customerEntitlements,
	type DbLicensePoolGrant,
	entitlements,
	type InsertLicensePoolGrant,
	licensePoolGrants,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const listByCustomer = async ({
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
	await db.query.licensePoolGrants.findMany({
		where: and(
			eq(licensePoolGrants.org_id, orgId),
			eq(licensePoolGrants.env, env),
			eq(licensePoolGrants.internal_customer_id, internalCustomerId),
		),
	});

const getForUpdateByNaturalKey = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	licenseInternalProductId,
	internalFeatureId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	licenseInternalProductId: string;
	internalFeatureId: string;
}): Promise<DbLicensePoolGrant | undefined> => {
	const [grant] = await db
		.select()
		.from(licensePoolGrants)
		.where(
			and(
				eq(licensePoolGrants.org_id, orgId),
				eq(licensePoolGrants.env, env),
				eq(licensePoolGrants.internal_customer_id, internalCustomerId),
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
				licensePoolGrants.org_id,
				licensePoolGrants.env,
				licensePoolGrants.internal_customer_id,
				licensePoolGrants.license_internal_product_id,
				licensePoolGrants.internal_feature_id,
			],
		})
		.returning();

	return inserted;
};

const updatePeriodMarker = async ({
	db,
	grantId,
	periodGrantedAllowance,
	periodKey,
	updatedAt,
}: {
	db: DrizzleCli;
	grantId: string;
	periodGrantedAllowance: number;
	periodKey: number | null;
	updatedAt: number;
}) => {
	await db
		.update(licensePoolGrants)
		.set({
			period_granted_allowance: periodGrantedAllowance,
			period_key: periodKey,
			updated_at: updatedAt,
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

const getEntitlementById = async ({
	db,
	entitlementId,
}: {
	db: DrizzleCli;
	entitlementId: string;
}) => {
	const [entitlement] = await db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, entitlementId));

	return entitlement;
};

export const licensePoolGrantRepo = {
	listByCustomer,
	getForUpdateByNaturalKey,
	insertIgnoringDuplicate,
	updatePeriodMarker,
	getCustomerEntitlementById,
	getEntitlementById,
} as const;
