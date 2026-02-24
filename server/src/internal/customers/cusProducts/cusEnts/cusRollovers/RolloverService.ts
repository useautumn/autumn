import {
	type FullCustomerEntitlement,
	type Rollover,
	rollovers,
} from "@autumn/shared";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RepoContext } from "@/db/repoContext.js";
import { performMaximumClearing } from "./rolloverUtils.js";

export class RolloverService {
	static async update({
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: Partial<Rollover>;
	}) {
		if (!updates.balance && !updates.entities) return [];

		const data = await db
			.update(rollovers)
			.set(updates as any)
			.where(eq(rollovers.id, id))
			.returning();

		return data;
	}

	static async upsert({ db, rows }: { db: DrizzleCli; rows: Rollover[] }) {
		if (Array.isArray(rows) && rows.length === 0) return;

		const updateColumns = buildConflictUpdateColumns(rollovers, ["id"]);
		await db
			.insert(rollovers)
			.values(rows as any)
			.onConflictDoUpdate({
				target: rollovers.id,
				set: updateColumns,
			});
	}

	// static async bulkUpdate({ db, rows }: { db: DrizzleCli; rows: Rollover[] }) {
	//   if (rows.length === 0) return [];

	//   const results = [];
	//   for (const row of rows) {
	//     const result = await this.update({
	//       db,
	//       id: row.id,
	//       updates: row,
	//     });
	//     results.push(...result);
	//   }
	//   return results;
	// }

	static async getCurrentRollovers({
		// db,
		ctx,
		cusEntID,
	}: {
		// db: DrizzleCli;
		ctx: CronContext;
		cusEntID: string;
	}) {
		const { db } = ctx;
		return await db
			.select()
			.from(rollovers)
			.where(
				and(
					eq(rollovers.cus_ent_id, cusEntID),
					gte(rollovers.expires_at, new Date().getTime()),
				),
			);
	}

	static async insert({
		ctx,
		rows,
		fullCusEnt,
	}: {
		ctx: RepoContext;
		rows: Rollover[];
		fullCusEnt: FullCustomerEntitlement;
	}) {
		const { db } = ctx;
		if (rows.length === 0) return {};

		await db.insert(rollovers).values(rows).returning();

		return RolloverService.clearExcessRollovers({
			ctx,
			newRows: rows,
			fullCusEnt,
		});
	}

	/** Enforces the rollover max cap after new rollovers have been inserted into the DB. */
	static async clearExcessRollovers({
		ctx,
		newRows,
		fullCusEnt,
	}: {
		ctx: RepoContext;
		newRows: Rollover[];
		fullCusEnt: FullCustomerEntitlement;
	}): Promise<Rollover[]> {
		const { db } = ctx;
		const curRollovers = [...fullCusEnt.rollovers, ...newRows];

		const { toDelete, toUpdate } = performMaximumClearing({
			rows: curRollovers as Rollover[],
			cusEnt: fullCusEnt,
		});

		if (toDelete.length > 0) {
			await RolloverService.delete({ db, ids: toDelete });
		}

		if (toUpdate.length > 0) {
			await RolloverService.upsert({ db, rows: toUpdate });
		}

		return curRollovers
			.filter((r) => !toDelete.includes(r.id))
			.map((r) => toUpdate.find((u) => u.id === r.id) ?? r);
	}

	static async delete({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		if (ids.length === 0) return;
		const data = await db.delete(rollovers).where(inArray(rollovers.id, ids));
	}
}
