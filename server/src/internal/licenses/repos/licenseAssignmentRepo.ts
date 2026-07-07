import {
	CusProductStatus,
	customerProducts,
	customers,
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
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type DbLicenseAssignment = typeof customerProducts.$inferSelect;

const activeStatuses = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
];

const seatConditions = () => [
	isNotNull(customerProducts.license_parent_customer_product_id),
	isNotNull(customerProducts.internal_entity_id),
];

const activeAssignmentConditions = () => [
	...seatConditions(),
	inArray(customerProducts.status, activeStatuses),
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
	seatId,
}: {
	db: DrizzleCli;
	seatId: string;
}): Promise<DbLicenseAssignment | undefined> =>
	await db.query.customerProducts.findFirst({
		where: and(eq(customerProducts.id, seatId), ...seatConditions()),
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
				...seatConditions(),
				...(activeOnly
					? [inArray(customerProducts.status, activeStatuses)]
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

const listActiveStrandedByCustomer = async ({
	db,
	internalCustomerId,
	validParentCustomerProductIds,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	validParentCustomerProductIds: string[];
}): Promise<DbLicenseAssignment[]> =>
	await db.query.customerProducts.findMany({
		where: and(
			eq(customerProducts.internal_customer_id, internalCustomerId),
			...activeAssignmentConditions(),
			...(validParentCustomerProductIds.length > 0
				? [
						notInArray(
							customerProducts.license_parent_customer_product_id,
							validParentCustomerProductIds,
						),
					]
				: []),
		),
	});

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

const reparentAssignmentsByIds = async ({
	db,
	assignmentIds,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
	parentCustomerProductId: string;
}) => {
	if (assignmentIds.length === 0) return;
	await db
		.update(customerProducts)
		.set({ license_parent_customer_product_id: parentCustomerProductId })
		.where(inArray(customerProducts.id, assignmentIds));
};

const expireAssignmentsByIds = async ({
	db,
	assignmentIds,
	endedAt,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
	endedAt: number;
}) => {
	if (assignmentIds.length === 0) return;
	await db
		.update(customerProducts)
		.set({ status: CusProductStatus.Expired, ended_at: endedAt })
		.where(inArray(customerProducts.id, assignmentIds));
};

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
			parent,
			eq(customerProducts.license_parent_customer_product_id, parent.id),
		)
		.where(
			and(
				eq(customerProducts.internal_product_id, licenseInternalProductId),
				...activeAssignmentConditions(),
			),
		)
		.groupBy(customerProducts.license_parent_customer_product_id)
		.orderBy(desc(count()))
		.limit(1);
	return row?.value ?? 0;
};

const findLatestActiveCustomerLevelCustomerProduct = async ({
	db,
	internalCustomerId,
	internalProductId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	internalProductId: string;
}) =>
	await db.query.customerProducts.findFirst({
		where: and(
			eq(customerProducts.internal_customer_id, internalCustomerId),
			eq(customerProducts.internal_product_id, internalProductId),
			isNull(customerProducts.internal_entity_id),
			eq(customerProducts.status, CusProductStatus.Active),
			isNull(customerProducts.license_parent_customer_product_id),
		),
		orderBy: (table, { desc }) => [desc(table.created_at)],
	});

const getCustomerByInternalId = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}) =>
	await db.query.customers.findFirst({
		where: eq(customers.internal_id, internalCustomerId),
	});

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

const getProductByInternalId = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}) =>
	await db.query.products.findFirst({
		where: eq(products.internal_id, internalProductId),
	});

export const licenseAssignmentRepo = {
	findActiveAssignment,
	getAssignmentById,
	countActiveByParentAndLicense,
	listAssignmentsWithEntityAndProductByCustomer,
	listActiveAssignmentsByInternalEntityId,
	listActiveStrandedByCustomer,
	reparentAssignmentsByIds,
	expireAssignmentsByIds,
	maxActiveCountByCatalogLink,
	findLatestActiveCustomerLevelCustomerProduct,
	getCustomerByInternalId,
	getEntityByInternalId,
	getProductByInternalId,
} as const;
