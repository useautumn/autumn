import {
	type AppEnv,
	type FreeTrial,
	freeTrials,
	products,
} from "@autumn/shared";
import { buildConflictUpdateColumns } from "@server/db/dbUtils";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { and, eq, inArray } from "drizzle-orm";

export class FreeTrialService {
	static async insert({ db, data }: { db: DrizzleCli; data: FreeTrial }) {
		await db.insert(freeTrials).values(data as any);
	}

	static async upsert({ db, data }: { db: DrizzleCli; data: FreeTrial }) {
		const updateCols = buildConflictUpdateColumns(freeTrials, [
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
				eq(freeTrials.internal_product_id, products.internal_id),
			)
			.where(and(eq(products.org_id, orgId), eq(products.env, env)));

		return result[0];
	}
}
