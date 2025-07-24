import { DrizzleCli } from "@/db/initDrizzle.js";
import { Rollover, RolloverConfig, rollovers } from "@autumn/shared";
import { and, eq, gte, inArray } from "drizzle-orm";
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
    const data = await db
      .update(rollovers)
      .set(updates as any)
      .where(eq(rollovers.id, id))
      .returning();

    return data;
  }

  static async bulkUpdate({ db, rows }: { db: DrizzleCli; rows: Rollover[] }) {
    return await db.transaction(async (tx) => {
      const results = [];
      for (const row of rows) {
        const result = await tx
          .update(rollovers)
          .set(row as any)
          .where(eq(rollovers.id, row.id))
          .returning();
        results.push(...result);
      }
      return results;
    });
  }

  static async insert({
    db,
    rows,
    rolloverConfig,
    cusEntID,
    entityMode,
  }: {
    db: DrizzleCli;
    rows: Rollover[];
    rolloverConfig: RolloverConfig;
    cusEntID: string;
    entityMode: boolean;
  }) {
    console.log("Inserting rollovers:", JSON.stringify(rows, null, 2));
    await db
      .insert(rollovers)
      .values(rows as any)
      .returning();

    const currentRolloverRows = await db
      .select()
      .from(rollovers)
      .where(
        and(
          eq(rollovers.cus_ent_id, cusEntID),
          gte(rollovers.expires_at, new Date().getTime())
        )
      );

    let { toDelete, toUpdate } = await performMaximumClearing({
      rows: currentRolloverRows as Rollover[],
      rolloverConfig,
      cusEntID,
      entityMode,
    });

    if (toDelete.length > 0) {
      await RolloverService.delete({ db, ids: toDelete });
    }

    if (toUpdate.length > 0) {
      await RolloverService.bulkUpdate({ db, rows: toUpdate });
    }
  }

  static async delete({ db, ids }: { db: DrizzleCli; ids: string[] }) {
    const data = await db.delete(rollovers).where(inArray(rollovers.id, ids));
  }
}
