import {
	ACTIVE_STATUSES,
	type AppEnv,
	CusProductStatus,
	customerLicenses,
	customerProducts,
	type DbCustomerProduct,
	entities,
	products,
} from "@autumn/shared";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	or,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type DbLicenseAssignment = DbCustomerProduct;

const assignmentConditions = () => [
	isNotNull(customerProducts.license_parent_customer_product_id),
	isNotNull(customerProducts.internal_entity_id),
];

export const activeAssignmentConditions = () => [
	...assignmentConditions(),
	inArray(customerProducts.status, ACTIVE_STATUSES),
];

const findActiveAssignment = async ({
	db,
	internalCustomerId,
	internalEntityId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	internalEntityId: string;
	licenseInternalProductId: string;
}): Promise<DbLicenseAssignment | undefined> =>
	await db.query.customerProducts.findFirst({
		where: and(
			eq(customerProducts.internal_customer_id, internalCustomerId),
			eq(customerProducts.internal_entity_id, internalEntityId),
			eq(customerProducts.internal_product_id, licenseInternalProductId),
			...activeAssignmentConditions(),
		),
	});

const getAssignmentById = async ({
	db,
	assignmentId,
}: {
	db: DrizzleCli;
	assignmentId: string;
}): Promise<DbLicenseAssignment | undefined> =>
	await db.query.customerProducts.findFirst({
		where: and(
			eq(customerProducts.id, assignmentId),
			...assignmentConditions(),
		),
	});

const countActiveByParentAndLicense = async ({
	db,
	parentCustomerProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(customerProducts)
		.where(
			and(
				eq(
					customerProducts.license_parent_customer_product_id,
					parentCustomerProductId,
				),
				eq(customerProducts.internal_product_id, licenseInternalProductId),
				...activeAssignmentConditions(),
			),
		);
	return row?.value ?? 0;
};

/** SQL predicate: the aliased customer_products row is not a license
 * assignment (seat rows are entity-scoped with a license parent). */
export const notLicenseAssignmentSql = (alias: string) =>
	`(${alias}.license_parent_customer_product_id IS NULL OR ${alias}.internal_entity_id IS NULL)`;

const listAssignmentsWithEntityAndProductByCustomer = async ({
	db,
	internalCustomerId,
	entityId,
	licenseInternalProductId,
	parentCustomerProductId,
	activeOnly = true,
}: {
	db: DrizzleCli;
	internalCustomerId?: string;
	entityId?: string;
	licenseInternalProductId?: string;
	parentCustomerProductId?: string;
	activeOnly?: boolean;
}) =>
	await db
		.select({
			assignment: customerProducts,
			entity_id: entities.id,
			license_product_id: products.id,
		})
		.from(customerProducts)
		.innerJoin(
			entities,
			eq(customerProducts.internal_entity_id, entities.internal_id),
		)
		.innerJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.where(
			and(
				...(internalCustomerId
					? [eq(customerProducts.internal_customer_id, internalCustomerId)]
					: []),
				...assignmentConditions(),
				...(activeOnly
					? [inArray(customerProducts.status, ACTIVE_STATUSES)]
					: []),
				...(entityId ? [eq(entities.id, entityId)] : []),
				...(licenseInternalProductId
					? [eq(customerProducts.internal_product_id, licenseInternalProductId)]
					: []),
				...(parentCustomerProductId
					? [
							eq(
								customerProducts.license_parent_customer_product_id,
								parentCustomerProductId,
							),
						]
					: []),
			),
		);

const listActiveAssignmentsByInternalEntityId = async ({
	db,
	internalEntityId,
}: {
	db: DrizzleCli;
	internalEntityId: string;
}): Promise<DbLicenseAssignment[]> =>
	await db.query.customerProducts.findMany({
		where: and(
			eq(customerProducts.internal_entity_id, internalEntityId),
			...activeAssignmentConditions(),
		),
	});

/** Ends active seats anchored to no surviving pool link (unstamped or
 * dangling) — one set-based UPDATE per reconcile. */
const expireOrphanAssignments = async ({
	db,
	internalCustomerId,
	validCustomerLicenseLinkIds,
	endedAt,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	validCustomerLicenseLinkIds: string[];
	endedAt: number;
}) => {
	await db
		.update(customerProducts)
		.set({ status: CusProductStatus.Expired, ended_at: endedAt })
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				...activeAssignmentConditions(),
				or(
					isNull(customerProducts.customer_license_link_id),
					...(validCustomerLicenseLinkIds.length > 0
						? [
								notInArray(
									customerProducts.customer_license_link_id,
									validCustomerLicenseLinkIds,
								),
							]
						: []),
				),
			),
		);
};

/** Seats are grouped through their customer license — the seat's own parent
 * column goes stale on reparent; the customer license's never does. */
const maxActiveCountByCatalogLink = async ({
	db,
	parentInternalProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentInternalProductId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	const parent = db
		.select({ id: customerProducts.id })
		.from(customerProducts)
		.where(eq(customerProducts.internal_product_id, parentInternalProductId))
		.as("license_parents");
	const [row] = await db
		.select({ value: count() })
		.from(customerProducts)
		.innerJoin(
			customerLicenses,
			eq(customerProducts.customer_license_link_id, customerLicenses.link_id),
		)
		.innerJoin(
			parent,
			eq(customerLicenses.parent_customer_product_id, parent.id),
		)
		.where(
			and(
				eq(
					customerLicenses.license_internal_product_id,
					licenseInternalProductId,
				),
				...activeAssignmentConditions(),
			),
		)
		.groupBy(customerProducts.customer_license_link_id)
		.orderBy(desc(count()))
		.limit(1);
	return row?.value ?? 0;
};

/** Whether the customer holds this license plan (matched by public id, any
 * version) at the customer level — the priced-assignment gate is plan-level. */
const findCustomerLevelLicenseProduct = async ({
	db,
	internalCustomerId,
	productId,
	orgId,
	env,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	productId: string;
	orgId: string;
	env: AppEnv;
}): Promise<DbCustomerProduct | undefined> => {
	const rows = await db
		.select({ row: customerProducts })
		.from(customerProducts)
		.innerJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(products.id, productId),
				eq(products.org_id, orgId),
				eq(products.env, env),
				isNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, ACTIVE_STATUSES),
				isNull(customerProducts.license_parent_customer_product_id),
			),
		)
		.limit(1);
	return rows[0]?.row;
};

const getEntityByInternalId = async ({
	db,
	internalEntityId,
}: {
	db: DrizzleCli;
	internalEntityId: string;
}) =>
	await db.query.entities.findFirst({
		where: eq(entities.internal_id, internalEntityId),
	});

export const licenseAssignmentRepo = {
	findActiveAssignment,
	getAssignmentById,
	countActiveByParentAndLicense,
	listAssignmentsWithEntityAndProductByCustomer,
	listActiveAssignmentsByInternalEntityId,
	expireOrphanAssignments,
	maxActiveCountByCatalogLink,
	findCustomerLevelLicenseProduct,
	getEntityByInternalId,
} as const;
