import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { FreeTrial, freeTrials } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

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
}
