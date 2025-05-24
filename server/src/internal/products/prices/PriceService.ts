import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { Price, prices, Product } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";

export class PriceService {
  static async getCustomInEntIds({
    db,
    entitlementIds,
  }: {
    db: DrizzleCli;
    entitlementIds: string[];
  }) {
    return await db.query.prices.findMany({
      where: and(
        inArray(prices.entitlement_id, entitlementIds),
        eq(prices.is_custom, true),
      ),
    });
  }

  static async getInIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
    return (await db.query.prices.findMany({
      where: inArray(prices.id, ids),
      with: {
        product: true,
      },
    })) as (Price & { product: Product })[];
  }

  static async insert({ db, data }: { db: DrizzleCli; data: Price | Price[] }) {
    if (Array.isArray(data) && data.length === 0) {
      return;
    }

    await db.insert(prices).values(data as any);
  }

  static async update({
    db,
    id,
    update,
  }: {
    db: DrizzleCli;
    id: string;
    update: Partial<Price>;
  }) {
    await db.update(prices).set(update).where(eq(prices.id, id));
  }

  static async upsert({ db, data }: { db: DrizzleCli; data: Price | Price[] }) {
    if (Array.isArray(data) && data.length == 0) return;

    const updateColumns = buildConflictUpdateColumns(prices, ["id"]);

    await db
      .insert(prices)
      .values(data as any)
      .onConflictDoUpdate({
        target: prices.id,
        set: updateColumns,
      });
  }

  static async deleteInIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
    await db.delete(prices).where(inArray(prices.id, ids));
  }
}
