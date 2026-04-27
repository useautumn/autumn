import {
	customers,
	type Entity,
	EntityErrorCode,
	ErrCode,
	entities,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { isUniqueConstraintError } from "@/db/dbUtils";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import RecaseError from "@/utils/errorUtils.js";

export class EntityService {
	static async listById({
		ctx,
		id,
		withCustomer,
	}: {
		ctx: AutumnContext;
		id: string;
		withCustomer?: boolean;
	}) {
		return await ctx.db.query.entities.findMany({
			where: (entities, { eq }) =>
				and(
					eq(entities.id, id),
					eq(entities.org_id, ctx.org.id),
					eq(entities.env, ctx.env),
				),
			with: {
				customer: withCustomer ? true : undefined,
			},
		});
	}
	static async get({
		db,
		id,
		internalCustomerId,
		internalFeatureId,
	}: {
		db: DrizzleCli;
		id: string;
		internalCustomerId: string;
		internalFeatureId: string;
	}) {
		return await db.query.entities.findFirst({
			where: (entities, { eq, and }) =>
				and(
					eq(entities.id, id),
					eq(entities.internal_customer_id, internalCustomerId),
					eq(entities.internal_feature_id, internalFeatureId),
				),
		});
	}
	static async getNull({
		db,
		orgId,
		env,
		internalCustomerId,
		internalFeatureId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: string;
		internalCustomerId: string;
		internalFeatureId: string;
	}) {
		return await db.query.entities.findFirst({
			where: (entities, { eq, and }) =>
				and(
					eq(entities.id, sql`null`),
					eq(entities.org_id, orgId),
					eq(entities.env, env),
					eq(entities.internal_customer_id, internalCustomerId),
					eq(entities.internal_feature_id, internalFeatureId),
				),
		});
	}
	static async insert({ db, data }: { db: DrizzleCli; data: Entity[] }) {
		if (data.length === 0) {
			return [];
		}

		try {
			const results = await db.insert(entities).values(data).returning();

			return results as Entity[];
		} catch (error) {
			if (isUniqueConstraintError(error)) {
				throw new RecaseError({
					message: `Entity with ID ${data?.[0]?.id} already exists`,
					code: EntityErrorCode.EntityAlreadyExists,
					statusCode: 409,
				});
			}
			throw error;
		}
	}

	static async getByInternalId({
		db,
		internalId,
	}: {
		db: DrizzleCli;
		internalId: string;
	}) {
		const entity = await db.query.entities.findFirst({
			where: (entities, { eq, and }) =>
				and(eq(entities.internal_id, internalId)),
		});
		if (!entity) {
			throw new RecaseError({
				message: `Entity not found for internal ID ${internalId}`,
				code: ErrCode.EntityNotFound,
				statusCode: 404,
			});
		}

		return entity as Entity;
	}

	static async list({
		db,
		internalCustomerId,
		inFeatureIds,
		isDeleted,
		limit,
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		inFeatureIds?: string[];
		isDeleted?: boolean;
		limit?: number;
	}) {
		return (await db.query.entities.findMany({
			where: (entities, { eq }) =>
				and(
					eq(entities.internal_customer_id, internalCustomerId),
					inFeatureIds
						? inArray(entities.internal_feature_id, inFeatureIds)
						: undefined,
					isDeleted ? eq(entities.deleted, isDeleted) : undefined,
				),
			limit,
		})) as Entity[];
	}

	static async listForInvalidation({
		db,
		customerId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		customerId: string;
		orgId: string;
		env: string;
	}) {
		const rows = await db
			.select({
				id: entities.id,
			})
			.from(entities)
			.innerJoin(
				customers,
				eq(customers.internal_id, entities.internal_customer_id),
			)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, orgId),
					eq(customers.env, env),
					isNotNull(entities.id),
				),
			)
			.limit(1000);

		return rows.flatMap((row) => (row.id ? [row.id] : []));
	}

	static async update({
		db,
		internalId,
		update,
	}: {
		db: DrizzleCli;
		internalId: string;
		update: Partial<Entity>;
	}) {
		const results = await db
			.update(entities)
			.set(update)
			.where(eq(entities.internal_id, internalId))
			.returning();

		if (results.length === 0) {
			throw new RecaseError({
				message: `Entity not found for internal ID ${internalId}`,
				code: ErrCode.EntityNotFound,
				statusCode: 404,
			});
		}

		return results[0] as Entity;
	}

	static async deleteInInternalIds({
		db,
		internalIds,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		internalIds: string[];
		orgId: string;
		env: string;
	}) {
		const _results = await db
			.delete(entities)
			.where(
				and(
					inArray(entities.internal_id, internalIds),
					eq(entities.org_id, orgId),
					eq(entities.env, env),
				),
			)
			.returning();
	}
}
