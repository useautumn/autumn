import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, FreeTrial, freeTrials, products } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { and, count, desc, eq, inArray } from "drizzle-orm";

export class FreeTrialService {
	static async insert({ db, data }: { db: DrizzleCli; data: FreeTrial }) {
		await db.insert(freeTrials).values(data as any);
	}

	static async upsert({ db, data }: { db: DrizzleCli; data: FreeTrial }) {
		let updateCols = buildConflictUpdateColumns(freeTrials, [
			"id",
			"internal_product_id",
		]);

		await db
			.insert(freeTrials)
			.values(data as any)
			.onConflictDoUpdate({
				target: [freeTrials.id],
				set: updateCols,
			});
	}

	static async update({
		db,
		freeTrialId,
		update,
	}: {
		db: DrizzleCli;
		freeTrialId: string;
		update: Partial<FreeTrial>;
	}) {
		await db
			.update(freeTrials)
			.set(update)
			.where(eq(freeTrials.id, freeTrialId));
	}

	static async delete({ db, id }: { db: DrizzleCli; id: string }) {
		await db.delete(freeTrials).where(eq(freeTrials.id, id));
	}

	static async getByProductId({
		db,
		productId,
	}: {
		db: DrizzleCli;
		productId: string;
	}) {
		return await db.query.freeTrials.findFirst({
			where: eq(freeTrials.internal_product_id, productId),
		});
	}

	static async list({
		db,
		productIds,
	}: {
		db: DrizzleCli;
		productIds: string[];
	}) {
		const result = await db
			.select({ id: freeTrials.internal_product_id })
			.from(freeTrials)
			.where(inArray(freeTrials.internal_product_id, productIds));
		return { count: result.length, ids: result.map((r) => r.id) };
	}

	static async listByOrgId({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		const result = await db
			.select({
				product: products,
				trial: freeTrials,
			})
			.from(freeTrials)
			.innerJoin(
				products,
				eq(freeTrials.internal_product_id, products.internal_id)
			)
			.where(and(eq(products.org_id, orgId), eq(products.env, env)));

		return result[0];
	}

}
