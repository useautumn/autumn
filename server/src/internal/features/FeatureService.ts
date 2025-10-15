import { type AppEnv, ErrCode, type Feature, features } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { clearOrgCache } from "../orgs/orgUtils/clearOrgCache.js";

export class FeatureService {
	static async list({
		db,
		orgId,
		env,
		archived,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		archived?: boolean;
	}) {
		const features = await db.query.features.findMany({
			where: (features, { eq, and }) =>
				and(
					eq(features.org_id, orgId),
					eq(features.env, env),
					notNullish(archived) ? eq(features.archived, archived!) : undefined,
				),

			orderBy: (features, { desc }) => [desc(features.internal_id)],
		});

		return features as Feature[]; // TODO: DRIZZLE TYPE REFACTOR
	}

	static async getFromReq(req: any) {
		if (req.features) return req.features as Feature[];
		const features = await FeatureService.list({
			db: req.db,
			orgId: req.orgId,
			env: req.env,
		});

		return features as Feature[];
	}

	static async get({
		db,
		id,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: AppEnv;
	}) {
		const feature = await db.query.features.findFirst({
			where: (features, { eq, and }) =>
				and(
					eq(features.id, id),
					eq(features.org_id, orgId),
					eq(features.env, env),
				),
		});
		return feature as Feature;
	}

	static async update({
		db,
		id,
		orgId,
		env,
		internalId,
		updates,
	}: {
		db: DrizzleCli;
		id?: string;
		orgId?: string;
		env?: AppEnv;
		internalId?: string;
		updates: any;
	}) {
		if (!id && !internalId) {
			throw new RecaseError({
				message: "id or internalId is required to update feature",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		if (id && (!orgId || !env)) {
			throw new RecaseError({
				message: "orgId and env are required to update feature by id",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		let updatedFeatures;
		if (internalId) {
			updatedFeatures = await db
				.update(features)
				.set(updates)
				.where(eq(features.internal_id, internalId))
				.returning();
		} else {
			updatedFeatures = await db
				.update(features)
				.set(updates)
				.where(
					and(
						eq(features.id, id!),
						eq(features.org_id, orgId!),
						eq(features.env, env!),
					),
				)
				.returning();
		}

		await clearOrgCache({
			db,
			orgId: updatedFeatures[0].org_id!,
			env: updatedFeatures[0].env as AppEnv,
		});

		return updatedFeatures.length > 0 ? (updatedFeatures[0] as Feature) : null;
	}

	static async insert({
		db,
		data,
		logger,
	}: {
		db: DrizzleCli;
		data: Feature[] | Feature;
		logger: any;
	}) {
		try {
			const insertedData = await db
				.insert(features)
				.values(data as any) // DRIZZLE TYPE REFACTOR
				.returning();

			if (insertedData && insertedData.length > 0) {
				const orgId = insertedData[0].org_id;
				await clearOrgCache({
					db,
					orgId: orgId!,
					logger,
				});
			}
			return insertedData as Feature[]; // DRIZZLE TYPE REFACTOR
		} catch (error: any) {
			if (error.code === "23505") {
				const id = Array.isArray(data) ? data.map((f) => f.id) : data.id;
				throw new RecaseError({
					message: `Feature ${id} already exists`,
					code: ErrCode.DuplicateFeatureId,
					statusCode: 400,
				});
			}
		}
	}

	static async delete({
		db,
		featureId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		featureId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const deletedFeatures = await db
			.delete(features)
			.where(
				and(
					eq(features.id, featureId),
					eq(features.org_id, orgId),
					eq(features.env, env),
				),
			)
			.returning();

		if (deletedFeatures.length === 0) {
			return null;
		}

		await clearOrgCache({
			db,
			orgId,
			env,
		});
		return deletedFeatures[0] as Feature;
	}

	static async deleteByOrgId({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		await db
			.delete(features)
			.where(and(eq(features.org_id, orgId), eq(features.env, env)));
	}
}
