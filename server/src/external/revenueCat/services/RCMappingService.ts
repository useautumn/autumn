import { type AppEnv, type RevcatMapping, revcatMappings } from "@shared/index";
import { and, arrayContains, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export class RCMappingService {
	/**
	 * Find the Autumn product ID that maps to a given RevenueCat product ID
	 */
	static async getAutumnProductId({
		db,
		orgId,
		env,
		revcatProductId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		revcatProductId: string;
	}): Promise<string | null> {
		const [mapping] = await db
			.select({ autumn_product_id: revcatMappings.autumn_product_id })
			.from(revcatMappings)
			.where(
				and(
					eq(revcatMappings.org_id, orgId),
					eq(revcatMappings.env, env),
					arrayContains(revcatMappings.revenuecat_product_ids, [
						revcatProductId,
					]),
				),
			)
			.limit(1);

		return mapping?.autumn_product_id ?? null;
	}

	static async getAll({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		return db
			.select()
			.from(revcatMappings)
			.where(
				and(eq(revcatMappings.org_id, orgId), eq(revcatMappings.env, env)),
			);
	}

	static async upsert({ db, data }: { db: DrizzleCli; data: RevcatMapping }) {
		return db
			.insert(revcatMappings)
			.values(data)
			.onConflictDoUpdate({
				target: [
					revcatMappings.org_id,
					revcatMappings.env,
					revcatMappings.autumn_product_id,
				],
				set: { revenuecat_product_ids: data.revenuecat_product_ids },
			})
			.returning();
	}

	static async get({
		db,
		orgId,
		env,
		autumnProductId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		autumnProductId: string;
	}) {
		const mapping = await db
			.select()
			.from(revcatMappings)
			.where(
				and(
					eq(revcatMappings.org_id, orgId),
					eq(revcatMappings.env, env),
					eq(revcatMappings.autumn_product_id, autumnProductId),
				),
			);
		return mapping;
	}

	static async update({
		db,
		orgId,
		env,
		autumnProductId,
		data,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		autumnProductId: string;
		data: Partial<RevcatMapping>;
	}) {
		const mapping = await db
			.update(revcatMappings)
			.set(data)
			.where(
				and(
					eq(revcatMappings.org_id, orgId),
					eq(revcatMappings.env, env),
					eq(revcatMappings.autumn_product_id, autumnProductId),
				),
			);
		return mapping;
	}

	static async delete({
		db,
		orgId,
		env,
		autumnProductId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		autumnProductId: string;
	}) {
		const mapping = await db
			.delete(revcatMappings)
			.where(
				and(
					eq(revcatMappings.org_id, orgId),
					eq(revcatMappings.env, env),
					eq(revcatMappings.autumn_product_id, autumnProductId),
				),
			);
		return mapping;
	}
}
