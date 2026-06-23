import {
	type FullCusEntWithProduct,
	type Rollover,
	rollovers,
} from "@autumn/shared";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
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
					or(
						isNull(rollovers.expires_at),
						gt(rollovers.expires_at, Date.now()),
					),
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
		fullCusEnt: FullCusEntWithProduct;
	}) {
		const { db } = ctx;
		if (rows.length === 0) return {};

		await db.insert(rollovers).values(rows).returning();

		const result = await RolloverService.clearExcessRollovers({
			ctx,
			newRows: rows,
			fullCusEnt,
		});

		return result;
	}

	/** Enforces the rollover max cap after new rollovers have been inserted into the DB. */
	static async clearExcessRollovers({
		ctx,
		newRows,
		fullCusEnt,
	}: {
		ctx: RepoContext;
		newRows: Rollover[];
		fullCusEnt: FullCusEntWithProduct;
	}): Promise<{
		rollovers: Rollover[];
		deletedIds: string[];
		overwrites: Rollover[];
	}> {
		const { db } = ctx;

		// No cap configured → nothing to clear, skip the extra read. Returns the
		// caller's list as-is, so callers passing an incomplete fullCusEnt (e.g.
		// the cron's rollovers:[]) must discard the returned rollovers.
		const rolloverConfig = fullCusEnt.entitlement.rollover;
		if (
			!rolloverConfig ||
			(rolloverConfig.max == null && rolloverConfig.max_percentage == null)
		) {
			return {
				rollovers: [...fullCusEnt.rollovers, ...newRows],
				deletedIds: [],
				overwrites: [],
			};
		}

		// Source the live rollover set from the DB rather than trusting
		// fullCusEnt.rollovers, which some callers pass incomplete (the reset
		// cron hardcodes []). newRows are already inserted, so this includes them.
		const now = Date.now();
		const curRollovers = (await db
			.select()
			.from(rollovers)
			.where(
				and(
					eq(rollovers.cus_ent_id, fullCusEnt.id),
					or(isNull(rollovers.expires_at), gt(rollovers.expires_at, now)),
				),
			)) as Rollover[];

		const { toDelete, toUpdate } = performMaximumClearing({
			rows: curRollovers,
			cusEnt: fullCusEnt,
		});

		if (toDelete.length > 0) {
			await RolloverService.delete({ db, ids: toDelete });
		}

		if (toUpdate.length > 0) {
			await RolloverService.upsert({ db, rows: toUpdate });
		}

		const remainingRollovers = curRollovers
			.filter((r) => !toDelete.includes(r.id))
			.map((r) => toUpdate.find((u) => u.id === r.id) ?? r);

		return {
			rollovers: remainingRollovers,
			deletedIds: toDelete,
			overwrites: toUpdate,
		};
	}

	static async delete({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		if (ids.length === 0) return;
		const data = await db.delete(rollovers).where(inArray(rollovers.id, ids));
	}
}
