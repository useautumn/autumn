import {
	type AppEnv,
	CusProductStatus,
	customerProducts,
	customers,
	type DbLicenseAssignment,
	entities,
	licenseAssignments,
	products,
} from "@autumn/shared";
import { and, count, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const findActive = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	internalEntityId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	internalEntityId: string;
	licenseInternalProductId: string;
}) =>
	await db.query.licenseAssignments.findFirst({
		where: and(
			eq(licenseAssignments.org_id, orgId),
			eq(licenseAssignments.env, env),
			eq(licenseAssignments.internal_customer_id, internalCustomerId),
			eq(licenseAssignments.internal_entity_id, internalEntityId),
			eq(
				licenseAssignments.license_internal_product_id,
				licenseInternalProductId,
			),
			isNull(licenseAssignments.ended_at),
		),
	});

const listActiveByInternalEntityId = async ({
	db,
	orgId,
	env,
	internalEntityId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalEntityId: string;
}) =>
	await db
		.select({
			id: licenseAssignments.id,
			provisioned_customer_product_id:
				licenseAssignments.provisioned_customer_product_id,
		})
		.from(licenseAssignments)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(licenseAssignments.internal_entity_id, internalEntityId),
				isNull(licenseAssignments.ended_at),
			),
		);

const getById = async ({
	db,
	orgId,
	env,
	assignmentId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	assignmentId: string;
}) =>
	await db.query.licenseAssignments.findFirst({
		where: and(
			eq(licenseAssignments.id, assignmentId),
			eq(licenseAssignments.org_id, orgId),
			eq(licenseAssignments.env, env),
		),
	});

const insert = async ({
	db,
	orgId,
	env,
	id,
	parentCustomerProductId,
	internalCustomerId,
	internalEntityId,
	licenseInternalProductId,
	provisionedCustomerProductId,
	metadata,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	id: string;
	parentCustomerProductId: string;
	internalCustomerId: string;
	internalEntityId: string;
	licenseInternalProductId: string;
	provisionedCustomerProductId: string;
	metadata?: Record<string, unknown>;
}): Promise<DbLicenseAssignment> => {
	const [assignment] = await db
		.insert(licenseAssignments)
		.values({
			id,
			org_id: orgId,
			env,
			parent_customer_product_id: parentCustomerProductId,
			internal_customer_id: internalCustomerId,
			internal_entity_id: internalEntityId,
			license_internal_product_id: licenseInternalProductId,
			provisioned_customer_product_id: provisionedCustomerProductId,
			started_at: Date.now(),
			ended_at: null,
			metadata: metadata ?? {},
		})
		.returning();

	return assignment;
};

const countActiveByParentAndLicense = async ({
	db,
	parentCustomerProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentCustomerProductId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	const [{ value }] = await db
		.select({ value: count() })
		.from(licenseAssignments)
		.where(
			and(
				eq(
					licenseAssignments.parent_customer_product_id,
					parentCustomerProductId,
				),
				eq(
					licenseAssignments.license_internal_product_id,
					licenseInternalProductId,
				),
				isNull(licenseAssignments.ended_at),
			),
		);

	return value;
};

const lockCustomerProductById = async ({
	db,
	customerProductId,
}: {
	db: DrizzleCli;
	customerProductId: string;
}) => {
	await db
		.select({ id: customerProducts.id })
		.from(customerProducts)
		.where(eq(customerProducts.id, customerProductId))
		.for("update");
};

const listActiveWithEntityByCustomer = async ({
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
			assignment: licenseAssignments,
			entity_id: entities.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(licenseAssignments.internal_customer_id, internalCustomerId),
				isNull(licenseAssignments.ended_at),
			),
		);

const findLatestActiveEntityCustomerProduct = async ({
	db,
	internalCustomerId,
	internalProductId,
	internalEntityId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	internalProductId: string;
	internalEntityId: string;
}) =>
	await db.query.customerProducts.findFirst({
		where: and(
			eq(customerProducts.internal_customer_id, internalCustomerId),
			eq(customerProducts.internal_product_id, internalProductId),
			eq(customerProducts.internal_entity_id, internalEntityId),
			eq(customerProducts.status, CusProductStatus.Active),
			isNull(customerProducts.license_assignment_id),
		),
		orderBy: (table, { desc }) => [desc(table.created_at)],
	});

const maxActiveCountByCatalogLink = async ({
	db,
	parentInternalProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentInternalProductId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	const rows = await db
		.select({ value: count() })
		.from(licenseAssignments)
		.innerJoin(
			customerProducts,
			eq(licenseAssignments.parent_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(customerProducts.internal_product_id, parentInternalProductId),
				eq(
					licenseAssignments.license_internal_product_id,
					licenseInternalProductId,
				),
				isNull(licenseAssignments.ended_at),
			),
		)
		.groupBy(licenseAssignments.parent_customer_product_id);

	return rows.reduce((max, row) => Math.max(max, row.value), 0);
};

const existsActiveByCustomer = async ({
	db,
	orgId,
	env,
	internalCustomerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
}) => {
	const [row] = await db
		.select({ id: licenseAssignments.id })
		.from(licenseAssignments)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(licenseAssignments.internal_customer_id, internalCustomerId),
				isNull(licenseAssignments.ended_at),
			),
		)
		.limit(1);
	return row !== undefined;
};

const listActiveStrandedByCustomer = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	validParentCustomerProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	validParentCustomerProductIds: string[];
}) =>
	await db
		.select({
			assignmentId: licenseAssignments.id,
			provisionedCustomerProductId:
				licenseAssignments.provisioned_customer_product_id,
			licenseInternalProductId: licenseAssignments.license_internal_product_id,
		})
		.from(licenseAssignments)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(licenseAssignments.internal_customer_id, internalCustomerId),
				isNull(licenseAssignments.ended_at),
				validParentCustomerProductIds.length > 0
					? notInArray(
							licenseAssignments.parent_customer_product_id,
							validParentCustomerProductIds,
						)
					: undefined,
			),
		);

const listActiveWithProductByParentCustomerProductId = async ({
	db,
	orgId,
	env,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	parentCustomerProductId: string;
}) =>
	await db
		.select({
			assignmentId: licenseAssignments.id,
			entityId: entities.id,
			licenseInternalProductId: licenseAssignments.license_internal_product_id,
			licenseProductId: products.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			products,
			eq(licenseAssignments.license_internal_product_id, products.internal_id),
		)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(
					licenseAssignments.parent_customer_product_id,
					parentCustomerProductId,
				),
				isNull(licenseAssignments.ended_at),
			),
		);

const reparentByIds = async ({
	db,
	assignmentIds,
	parentCustomerProductId,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
	parentCustomerProductId: string;
}) => {
	await db
		.update(licenseAssignments)
		.set({ parent_customer_product_id: parentCustomerProductId })
		.where(inArray(licenseAssignments.id, assignmentIds));
};

const endById = async ({
	db,
	assignmentId,
	endedAt,
}: {
	db: DrizzleCli;
	assignmentId: string;
	endedAt: number;
}) => {
	await db
		.update(licenseAssignments)
		.set({ ended_at: endedAt })
		.where(eq(licenseAssignments.id, assignmentId));
};

const endByIds = async ({
	db,
	assignmentIds,
	endedAt,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
	endedAt: number;
}) => {
	await db
		.update(licenseAssignments)
		.set({ ended_at: endedAt })
		.where(inArray(licenseAssignments.id, assignmentIds));
};

const expireProvisionedCustomerProductsByIds = async ({
	db,
	customerProductIds,
	endedAt,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
	endedAt: number;
}) => {
	await db
		.update(customerProducts)
		.set({
			status: CusProductStatus.Expired,
			ended_at: endedAt,
			updated_at: endedAt,
		})
		.where(inArray(customerProducts.id, customerProductIds));
};

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

const listWithEntityAndProductByCustomer = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	entityId,
	licenseInternalProductId,
	activeOnly,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
	entityId?: string;
	licenseInternalProductId?: string;
	activeOnly: boolean;
}) =>
	await db
		.select({
			assignment: licenseAssignments,
			entity_id: entities.id,
			license_product_id: products.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.innerJoin(
			products,
			eq(licenseAssignments.license_internal_product_id, products.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				eq(licenseAssignments.internal_customer_id, internalCustomerId),
				entityId ? eq(entities.id, entityId) : undefined,
				licenseInternalProductId
					? eq(
							licenseAssignments.license_internal_product_id,
							licenseInternalProductId,
						)
					: undefined,
				activeOnly ? isNull(licenseAssignments.ended_at) : undefined,
			),
		);

export const licenseAssignmentRepo = {
	findActive,
	listActiveByInternalEntityId,
	listActiveStrandedByCustomer,
	existsActiveByCustomer,
	maxActiveCountByCatalogLink,
	findLatestActiveEntityCustomerProduct,
	getById,
	insert,
	countActiveByParentAndLicense,
	lockCustomerProductById,
	listActiveWithEntityByCustomer,
	listActiveWithProductByParentCustomerProductId,
	reparentByIds,
	endById,
	endByIds,
	expireProvisionedCustomerProductsByIds,
	getCustomerByInternalId,
	getEntityByInternalId,
	getProductByInternalId,
	listWithEntityAndProductByCustomer,
} as const;
