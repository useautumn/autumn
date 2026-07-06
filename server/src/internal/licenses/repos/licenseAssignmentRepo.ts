import {
	type AppEnv,
	CusProductStatus,
	customerProducts,
	customers,
	type DbLicenseAssignment,
	entities,
	licenseAssignments,
	licensePools,
	products,
} from "@autumn/shared";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
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
	licensePoolId,
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
	licensePoolId: string;
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
			license_pool_id: licensePoolId,
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

const countActiveByPoolId = async ({
	db,
	licensePoolId,
}: {
	db: DrizzleCli;
	licensePoolId: string;
}): Promise<number> => {
	const [{ value }] = await db
		.select({ value: count() })
		.from(licenseAssignments)
		.where(
			and(
				eq(licenseAssignments.license_pool_id, licensePoolId),
				isNull(licenseAssignments.ended_at),
			),
		);

	return value;
};

const listActiveWithEntityByPoolIds = async ({
	db,
	orgId,
	env,
	poolIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	poolIds: string[];
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
				inArray(licenseAssignments.license_pool_id, poolIds),
				isNull(licenseAssignments.ended_at),
			),
		);

const listActiveWithEntityByParentCustomerProductIds = async ({
	db,
	orgId,
	env,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	parentCustomerProductIds: string[];
}) =>
	await db
		.select({
			assignmentId: licenseAssignments.id,
			provisionedCustomerProductId:
				licenseAssignments.provisioned_customer_product_id,
			licenseInternalProductId: licenseAssignments.license_internal_product_id,
			entityId: entities.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			licensePools,
			eq(licenseAssignments.license_pool_id, licensePools.id),
		)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, orgId),
				eq(licenseAssignments.env, env),
				inArray(
					licensePools.parent_customer_product_id,
					parentCustomerProductIds,
				),
				isNull(licenseAssignments.ended_at),
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
			licensePools,
			eq(licenseAssignments.license_pool_id, licensePools.id),
		)
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
				eq(licensePools.parent_customer_product_id, parentCustomerProductId),
				isNull(licenseAssignments.ended_at),
			),
		);

const listAssignedEntityIdsByCustomer = async ({
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
		.select({ entityId: entities.id })
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

const reparentByIds = async ({
	db,
	assignmentIds,
	licensePoolId,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
	licensePoolId: string;
}) => {
	await db
		.update(licenseAssignments)
		.set({ license_pool_id: licensePoolId })
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

const expireProvisionedCustomerProductById = async ({
	db,
	customerProductId,
	endedAt,
}: {
	db: DrizzleCli;
	customerProductId: string;
	endedAt: number;
}) => {
	await db
		.update(customerProducts)
		.set({
			status: CusProductStatus.Expired,
			ended_at: endedAt,
			updated_at: endedAt,
		})
		.where(eq(customerProducts.id, customerProductId));
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
	getById,
	insert,
	countActiveByPoolId,
	listActiveWithEntityByPoolIds,
	listActiveWithEntityByParentCustomerProductIds,
	listActiveWithProductByParentCustomerProductId,
	listAssignedEntityIdsByCustomer,
	reparentByIds,
	endById,
	endByIds,
	expireProvisionedCustomerProductById,
	expireProvisionedCustomerProductsByIds,
	getCustomerByInternalId,
	getEntityByInternalId,
	getProductByInternalId,
	listWithEntityAndProductByCustomer,
} as const;
