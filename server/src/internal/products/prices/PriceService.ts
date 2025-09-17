import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { Price, prices, Product } from "@autumn/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export class PriceService {
  static async get({ db, id }: { db: DrizzleCli; id: string }) {
    return (await db.query.prices.findFirst({
      where: eq(prices.id, id),
    })) as Price;
  }

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
        eq(prices.is_custom, true)
      ),
    });
  }

  static async getInIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
    if (!ids || ids.length === 0) {
      return [];
    }

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

  static async getByStripeId({
    db,
    stripePriceId,
  }: {
    db: DrizzleCli;
    stripePriceId: string;
  }) {
    return (await db.query.prices.findFirst({
      where: or(
        sql`${prices.config} ->> 'stripe_price_id' = ${stripePriceId}`,
        sql`${prices.config} ->> 'stripe_empty_price_id' = ${stripePriceId}`
      ),
      with: {
        product: true,
      },
    })) as (Price & { product: Product }) | undefined;
  }

  static async getByStripeIds({
    db,
    stripePriceIds,
  }: {
    db: DrizzleCli;
    stripePriceIds: string[];
  }) {
    if (!stripePriceIds || stripePriceIds.length === 0)
      return {} as Record<string, Price & { product: Product }>;

    const perIdExprs = stripePriceIds.map((id) =>
      or(
        sql`${prices.config} ->> 'stripe_price_id' = ${id}`,
        sql`${prices.config} ->> 'stripe_empty_price_id' = ${id}`
      )
    );

    let whereExpr = perIdExprs[0];
    for (let i = 1; i < perIdExprs.length; i++) {
      whereExpr = or(whereExpr, perIdExprs[i]);
    }

    const rows = (await db.query.prices.findMany({
      where: whereExpr,
      with: { product: true },
    })) as (Price & { product: Product })[];

    const byStripeId: Record<string, Price & { product: Product }> = {};
    for (const row of rows) {
      const cfg: any = (row as any).config || {};
      const ids = [cfg.stripe_price_id, cfg.stripe_empty_price_id].filter(
        Boolean
      ) as string[];
      for (const id of ids) byStripeId[id] = row;
    }
    return byStripeId;
  }
}
