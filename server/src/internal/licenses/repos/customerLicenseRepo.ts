import {
	customerLicenses,
	type DbCustomerLicense,
	type InsertCustomerLicense,
} from "@autumn/shared";
import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { carryCustomerLicenseState } from "./customerLicenseRepo/carryCustomerLicenseState.js";
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

const listReferencedPlanLicenseIds = async ({
	db,
	planLicenseIds,
}: {
	db: DrizzleCli;
	planLicenseIds: string[];
}): Promise<Set<string>> => {
	if (planLicenseIds.length === 0) return new Set();

	const rows = (await db.execute(sql`
		SELECT candidate.plan_license_id
		FROM unnest(${sql.param(planLicenseIds)}::text[])
			AS candidate(plan_license_id)
		CROSS JOIN LATERAL (
			SELECT 1
			FROM customer_licenses customer_license
			WHERE customer_license.plan_license_id = candidate.plan_license_id
			LIMIT 1
		) AS referenced(found)
	`)) as Array<{ plan_license_id: string }>;

	return new Set(rows.map((row) => row.plan_license_id));
};

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
				remaining: sql`${customerLicenses.remaining} + (${granted} - ${customerLicenses.granted})`,
				granted,
				...(planLicenseId ? { plan_license_id: planLicenseId } : {}),
				updated_at: Date.now(),
			},
		})
		.returning();
	return row;
};

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

const takeAssignment = async ({
	db,
	customerLicenseId,
	count = 1,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	count?: number;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({
			remaining: sql`${customerLicenses.remaining} - ${count}`,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(customerLicenses.id, customerLicenseId),
				gte(customerLicenses.remaining, count),
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

const setPaidQuantity = async ({
	db,
	customerLicenseId,
	paidQuantity,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	paidQuantity: number;
}): Promise<DbCustomerLicense | undefined> => {
	const [row] = await db
		.update(customerLicenses)
		.set({
			granted: sql`${customerLicenses.granted} - ${customerLicenses.paid_quantity} + ${paidQuantity}`,
			remaining: sql`${customerLicenses.remaining} + (${paidQuantity} - ${customerLicenses.paid_quantity})`,
			paid_quantity: paidQuantity,
			updated_at: Date.now(),
		})
		.where(eq(customerLicenses.id, customerLicenseId))
		.returning();
	return row;
};

const repointDefinition = async ({
	db,
	customerLicenseId,
	planLicenseId,
	included,
	paidQuantity,
}: {
	db: DrizzleCli;
	customerLicenseId: string;
	planLicenseId: string;
	included: number;
	paidQuantity?: number;
}): Promise<DbCustomerLicense | undefined> => {
	const newGranted = sql`${included} + COALESCE(${paidQuantity ?? null}::numeric, ${customerLicenses.paid_quantity})`;
	const [row] = await db
		.update(customerLicenses)
		.set({
			plan_license_id: planLicenseId,
			granted: newGranted,
			remaining: sql`${customerLicenses.remaining} + (${newGranted} - ${customerLicenses.granted})`,
			...(paidQuantity !== undefined ? { paid_quantity: paidQuantity } : {}),
			updated_at: Date.now(),
		})
		.where(eq(customerLicenses.id, customerLicenseId))
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
	listReferencedPlanLicenseIds,
	listBillingPriceRows,
	carryCustomerLicenseState,
	update,
	deleteByIds,
	upsertGranted,
	insertMany,
	takeAssignment,
	releaseAssignments,
	releaseAssignmentsByLinkId,
	setPaidQuantity,
	repointDefinition,
	setRemaining,
	deleteByParentIdsExcept,
} as const;
