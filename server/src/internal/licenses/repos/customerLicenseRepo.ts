import {
	customerLicenses,
	type DbCustomerLicense,
	type InsertCustomerLicense,
} from "@autumn/shared";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { listBillingPriceRows } from "./customerLicenseRepo/listBillingPriceRows.js";

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

/** All of a customer's pools, including ones whose parent is no longer live —
 * those are exactly the rows transitions operate on. */
const listByInternalCustomerId = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}): Promise<DbCustomerLicense[]> =>
	await db.query.customerLicenses.findMany({
		where: eq(customerLicenses.internal_customer_id, internalCustomerId),
	});

const update = async ({
	db,
	customerLicenseId,
	updates,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	updates: Partial<
		Pick<
			DbCustomerLicense,
			| "parent_customer_product_id"
			| "license_internal_product_id"
			| "plan_license_id"
			| "granted"
			| "remaining"
		>
	>;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({ ...updates, updated_at: Date.now() })
		.where(eq(customerLicenses.id, customerLicenseId))
		.returning();
	return row;
};

const deleteByIds = async ({ db, ids }: { db: DrizzleCli; ids: string[] }) => {
	if (ids.length === 0) return;
	await db.delete(customerLicenses).where(inArray(customerLicenses.id, ids));
};

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

/** Idempotent ensure + granted sync for a (parent, license) balance row.
 * Stamps plan_license_id when provided so stale links converge too. */
const upsertGranted = async ({
	db,
	internalCustomerId,
	parentCustomerProductId,
	licenseInternalProductId,
	planLicenseId,
	granted,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
	planLicenseId?: string;
	granted: number;
}): Promise<DbCustomerLicense> => {
	const [row] = await db
		.insert(customerLicenses)
		.values({
			id: generateId("cus_lic"),
			// Conflicting rows keep their link; only genuinely new pools mint.
			link_id: generateId("cus_lic_link"),
			internal_customer_id: internalCustomerId,
			parent_customer_product_id: parentCustomerProductId,
			license_internal_product_id: licenseInternalProductId,
			plan_license_id: planLicenseId ?? null,
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
				...(planLicenseId ? { plan_license_id: planLicenseId } : {}),
				updated_at: Date.now(),
			},
		})
		.returning();
	return row;
};

/** Insert-time pool creation (initFullCustomerProduct). Conflicts are left to
 * upsertGranted/reconcile — a concurrent take may have created the row. */
const insertMany = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: InsertCustomerLicense[];
}) => {
	if (rows.length === 0) return;
	await db.insert(customerLicenses).values(rows).onConflictDoNothing();
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

const releaseAssignmentsByLinkId = async ({
	db,
	customerLicenseLinkId,
	count,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	count: number;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({
			remaining: sql`LEAST(${customerLicenses.remaining} + ${count}, ${customerLicenses.granted})`,
			updated_at: Date.now(),
		})
		.where(eq(customerLicenses.link_id, customerLicenseLinkId))
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
	internalCustomerId,
	keepParentCustomerProductIds,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	keepParentCustomerProductIds: string[];
}) => {
	await db
		.delete(customerLicenses)
		.where(
			and(
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
	listByInternalCustomerId,
	listByParentCustomerProductIds,
	listBillingPriceRows,
	update,
	deleteByIds,
	upsertGranted,
	insertMany,
	takeAssignment,
	releaseAssignments,
	releaseAssignmentsByLinkId,
	setRemaining,
	deleteByParentIdsExcept,
} as const;
