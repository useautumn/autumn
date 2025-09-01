import {
	type InsertReplaceable,
	type Replaceable,
	replaceables,
} from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class RepService {
	static async insert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: InsertReplaceable[];
	}) {
		if (data.length === 0) return [];
		const inserted = await db.insert(replaceables).values(data).returning();
		return inserted as Replaceable[];
	}

	static async update({
		db,
		id,
		data,
	}: {
		db: DrizzleCli;
		id: string;
		data: any;
	}) {
		const updated = await db
			.update(replaceables)
			.set(data)
			.where(eq(replaceables.id, id))
			.returning();
		return updated as Replaceable[];
	}

	static async deleteInIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		if (ids.length === 0) return [];
		const deleted = await db
			.delete(replaceables)
			.where(inArray(replaceables.id, ids))
			.returning();
		return deleted as Replaceable[];
	}
}
