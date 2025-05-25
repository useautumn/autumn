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
    sb,
    freeTrialId,
    update,
  }: {
    sb: SupabaseClient;
    freeTrialId: string;
    update: Partial<FreeTrial>;
  }) {
    const { error } = await sb
      .from("free_trials")
      .update(update)
      .eq("id", freeTrialId);

    if (error) {
      throw error;
    }
  }

  static async delete({ db, id }: { db: DrizzleCli; id: string }) {
    await db.delete(freeTrials).where(eq(freeTrials.id, id));
  }
}
