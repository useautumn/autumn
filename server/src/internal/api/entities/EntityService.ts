import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { Entity, entities } from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

export class EntityService {
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
	static async insert({ db, data }: { db: DrizzleCli; data: any }) {
		if (data.length === 0) {
			return [];
		}

		const results = await db
			.insert(entities)
			.values(data as any)
			.returning();

		return results as Entity[];
	}

	static async getByInternalId({
		db,
		internalId,
	}: {
		db: DrizzleCli;
		internalId: string;
	}) {
		let entity = await db.query.entities.findFirst({
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
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		inFeatureIds?: string[];
		isDeleted?: boolean;
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
		})) as Entity[];
	}

	static async update({
		db,
		internalId,
		update,
	}: {
		db: DrizzleCli;
		internalId: string;
		update: any;
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
