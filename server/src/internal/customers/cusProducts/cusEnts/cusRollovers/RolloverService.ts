import { DrizzleCli } from "@/db/initDrizzle.js";
import { RolloverModel } from "@autumn/shared";
import { rollovers } from "@shared/db/schema.js";
import { eq, inArray } from "drizzle-orm";

export class RolloverService {
	static async update({
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: Partial<RolloverModel>;
	}) {
		const data = await db
			.update(rollovers)
			.set(updates as any)
			.where(eq(rollovers.id, id))
			.returning();

		return data;
	}

	static async insert({
		db,
		rows,
	}: {
		db: DrizzleCli;
		rows: RolloverModel[];
	}) {
		const data = await db.insert(rollovers).values(rows as any).returning();
		return data;
	}

	static async delete({
		db,
		ids,
	}: {
		db: DrizzleCli;
		ids: string[];
	}) {
		const data = await db.delete(rollovers).where(inArray(rollovers.id, ids));
	}
}