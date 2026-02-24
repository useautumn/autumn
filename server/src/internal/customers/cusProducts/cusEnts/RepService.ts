import {
	type InsertReplaceable,
	type Replaceable,
	replaceables,
} from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RepoContext } from "@/db/repoContext";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export class RepService {
	static async insert({
		ctx,
		data,
	}: {
		ctx: RepoContext;
		data: InsertReplaceable[];
	}) {
		if (data.length === 0) return [];
		const inserted = await ctx.db.insert(replaceables).values(data).returning();
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

	static async deleteInIds({
		ctx,
		ids,
	}: {
		ctx: AutumnContext;
		ids: string[];
	}) {
		const { db } = ctx;
		if (ids.length === 0) return [];
		const deleted = await db
			.delete(replaceables)
			.where(inArray(replaceables.id, ids))
			.returning();
		return deleted as Replaceable[];
	}
}
