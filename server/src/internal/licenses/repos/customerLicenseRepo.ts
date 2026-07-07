import {
	type AppEnv,
	customerLicenses,
	type DbCustomerLicense,
} from "@autumn/shared";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const getByParentAndLicense = async ({
	db,
	parentCustomerProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
}): Promise<DbCustomerLicense | undefined> =>
	await db.query.customerLicenses.findFirst({
		where: and(
			eq(customerLicenses.parent_customer_product_id, parentCustomerProductId),
			eq(
				customerLicenses.license_internal_product_id,
				licenseInternalProductId,
			),
		),
	});

const listByParentCustomerProductIds = async ({
	db,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	parentCustomerProductIds: string[];
}): Promise<DbCustomerLicense[]> => {
	if (parentCustomerProductIds.length === 0) return [];
	return await db.query.customerLicenses.findMany({
		where: inArray(
			customerLicenses.parent_customer_product_id,
			parentCustomerProductIds,
		),
	});
};

/** Idempotent ensure + granted sync for a (parent, license) balance row. */
const upsertGranted = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	parentCustomerProductId,
	licenseInternalProductId,
	granted,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
	granted: number;
}): Promise<DbCustomerLicense> => {
	const [row] = await db
		.insert(customerLicenses)
		.values({
			id: generateId("cus_lic"),
			org_id: orgId,
			env,
			internal_customer_id: internalCustomerId,
			parent_customer_product_id: parentCustomerProductId,
			license_internal_product_id: licenseInternalProductId,
			granted,
			remaining: granted,
		})
		.onConflictDoUpdate({
			target: [
				customerLicenses.parent_customer_product_id,
				customerLicenses.license_internal_product_id,
			],
			set: {
				// Granted moves shift remaining by the same delta so assigned
				// assignments stay accounted for.
				remaining: sql`${customerLicenses.remaining} + (${granted} - ${customerLicenses.granted})`,
				granted,
				updated_at: Date.now(),
			},
		})
		.returning();
	return row;
};

/** Atomically takes one assignment; rejected (returns undefined) when no
 * capacity remains. */
const takeAssignment = async ({
	db,
	customerLicenseId,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({
			remaining: sql`${customerLicenses.remaining} - 1`,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(customerLicenses.id, customerLicenseId),
				gt(customerLicenses.remaining, 0),
			),
		)
		.returning();
	return row;
};

const releaseAssignments = async ({
	db,
	parentCustomerProductId,
	licenseInternalProductId,
	count,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
	count: number;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({
			remaining: sql`LEAST(${customerLicenses.remaining} + ${count}, ${customerLicenses.granted})`,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(
					customerLicenses.parent_customer_product_id,
					parentCustomerProductId,
				),
				eq(
					customerLicenses.license_internal_product_id,
					licenseInternalProductId,
				),
			),
		)
		.returning();
	return row;
};

/** Self-heal: remaining = granted - live assignment count. */
const setRemaining = async ({
	db,
	customerLicenseId,
	remaining,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	remaining: number;
}) => {
	await db
		.update(customerLicenses)
		.set({ remaining, updated_at: Date.now() })
		.where(eq(customerLicenses.id, customerLicenseId));
};

const deleteByParentIdsExcept = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	keepParentCustomerProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	keepParentCustomerProductIds: string[];
}) => {
	await db
		.delete(customerLicenses)
		.where(
			and(
				eq(customerLicenses.org_id, orgId),
				eq(customerLicenses.env, env),
				eq(customerLicenses.internal_customer_id, internalCustomerId),
				...(keepParentCustomerProductIds.length > 0
					? [
							notInArray(
								customerLicenses.parent_customer_product_id,
								keepParentCustomerProductIds,
							),
						]
					: []),
			),
		);
};

export const customerLicenseRepo = {
	getByParentAndLicense,
	listByParentCustomerProductIds,
	upsertGranted,
	takeAssignment,
	releaseAssignments,
	setRemaining,
	deleteByParentIdsExcept,
} as const;
