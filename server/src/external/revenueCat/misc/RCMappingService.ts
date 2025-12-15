import {
	type AppEnv,
	type RevenuecatMapping,
	revenuecatMappings,
} from "@shared/index";
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
		revenuecatProductId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		revenuecatProductId: string;
	}): Promise<string | null> {
		const [mapping] = await db
			.select({ autumn_product_id: revenuecatMappings.autumn_product_id })
			.from(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, orgId),
					eq(revenuecatMappings.env, env),
					arrayContains(revenuecatMappings.revenuecat_product_ids, [
						revenuecatProductId,
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
			.from(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, orgId),
					eq(revenuecatMappings.env, env),
				),
			);
	}

	static async upsert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: RevenuecatMapping;
	}) {
		return db
			.insert(revenuecatMappings)
			.values(data)
			.onConflictDoUpdate({
				target: [
					revenuecatMappings.org_id,
					revenuecatMappings.env,
					revenuecatMappings.autumn_product_id,
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
			.from(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, orgId),
					eq(revenuecatMappings.env, env),
					eq(revenuecatMappings.autumn_product_id, autumnProductId),
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
		data: Partial<RevenuecatMapping>;
	}) {
		const mapping = await db
			.update(revenuecatMappings)
			.set(data)
			.where(
				and(
					eq(revenuecatMappings.org_id, orgId),
					eq(revenuecatMappings.env, env),
					eq(revenuecatMappings.autumn_product_id, autumnProductId),
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
			.delete(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, orgId),
					eq(revenuecatMappings.env, env),
					eq(revenuecatMappings.autumn_product_id, autumnProductId),
				),
			);
		return mapping;
	}
}
