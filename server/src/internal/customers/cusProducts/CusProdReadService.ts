import { CusProductStatus } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { customerProducts } from "@autumn/shared";
import { eq, isNotNull, sql, countDistinct, count, inArray } from "drizzle-orm";

const activeStatuses = [CusProductStatus.Active, CusProductStatus.PastDue];
export class CusProdReadService {
  static getCounts = async ({
    db,
    internalProductId,
  }: {
    db: DrizzleCli;
    internalProductId: string;
  }) => {
    let result = await db
      .select({
        active: countDistinct(
          sql`CASE WHEN ${inArray(customerProducts.status, activeStatuses)} THEN ${customerProducts.internal_customer_id} END`,
        ).as("active"),
        canceled: count(
          sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
        ).as("canceled"),
        custom: count(
          sql`CASE WHEN ${eq(customerProducts.is_custom, true)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
        ).as("custom"),
        trialing: count(
          sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
        ).as("trialing"),
        all: countDistinct(customerProducts.internal_customer_id).as("all"),
      })
      .from(customerProducts)
      .where(eq(customerProducts.internal_product_id, internalProductId));

    return result[0];
  };
}
