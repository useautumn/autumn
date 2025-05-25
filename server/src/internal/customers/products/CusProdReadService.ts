import { CusProductStatus, ErrCode } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { customerProducts } from "@shared/models/cusProductModels/cusProductTable.js";
import {
  eq,
  and,
  isNotNull,
  sql,
  countDistinct,
  count,
  or,
  inArray,
} from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import RecaseError from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import assert from "assert";

export class CusProdReadService {
  static getCounts = async ({
    db,
    internalProductId,
    sb,
  }: {
    db: DrizzleCli;
    sb: SupabaseClient;
    internalProductId: string;
  }) => {
    let result = await db
      .select({
        active: countDistinct(
          sql`CASE WHEN ${eq(customerProducts.status, CusProductStatus.Active)} THEN ${customerProducts.internal_customer_id} END`,
        ).as("active"),
        canceled: count(
          sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} AND ${eq(customerProducts.status, CusProductStatus.Active)} THEN 1 END`,
        ).as("canceled"),
        custom: count(
          sql`CASE WHEN ${eq(customerProducts.is_custom, true)} AND ${eq(customerProducts.status, CusProductStatus.Active)} THEN 1 END`,
        ).as("custom"),
        trialing: count(
          sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} AND ${eq(customerProducts.status, CusProductStatus.Active)} THEN 1 END`,
        ).as("trialing"),
        all: countDistinct(customerProducts.internal_customer_id).as("all"),
      })
      .from(customerProducts)
      .where(eq(customerProducts.internal_product_id, internalProductId));

    // let { data, error } = await sb.rpc("get_product_stats", {
    //   p_internal_id: internalProductId,
    // });

    // // Compare the results
    // if (data) {
    //   if (result[0].active !== data.f1) {
    //     console.log(`Active count mismatch: ${result[0].active} vs ${data.f1}`);
    //   }
    //   if (result[0].canceled !== data.f2) {
    //     console.log(
    //       `Canceled count mismatch: ${result[0].canceled} vs ${data.f2}`,
    //     );
    //   }
    //   if (result[0].custom !== data.f3) {
    //     console.log(`Custom count mismatch: ${result[0].custom} vs ${data.f3}`);
    //   }
    //   if (result[0].trialing !== data.f4) {
    //     console.log(
    //       `Trialing count mismatch: ${result[0].trialing} vs ${data.f4}`,
    //     );
    //   }
    //   if (result[0].all !== data.f5) {
    //     console.log(`All count mismatch: ${result[0].all} vs ${data.f5}`);
    //   }
    // }

    return result[0];
  };
}

// let customQuery = db
// .select({ count: countDistinct(customerProducts.internal_customer_id) })
// .from(customerProducts)
// .where(
//   and(
//     eq(customerProducts.internal_product_id, internalProductId),
//     eq(customerProducts.is_custom, true),
//     inArray(customerProducts.status, statuses),
//   ),
// )
// .as("custom");

// let trialingQuery = db
// .select({ count: countDistinct(customerProducts.internal_customer_id) })
// .from(customerProducts)
// .where(
//   and(
//     eq(customerProducts.internal_product_id, internalProductId),
//     isNotNull(customerProducts.trial_ends_at),
//     sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`,
//     inArray(customerProducts.status, statuses),
//   ),
// )
// .as("trialing");

// let allQuery = db
// .select({ count: countDistinct(customerProducts.internal_customer_id) })
// .from(customerProducts)
// .where(eq(customerProducts.internal_product_id, internalProductId))
// .as("all");

// let { data: result, error } = await sb.rpc("get_product_stats", {
//   p_internal_id: internalProductId,
// });

// if (error) {
//   console.error("Error getting counts", error);
//   throw error;
// }

// return {
//   active: result.f1,
//   canceled: result.f2,
//   custom: result.f3,
//   trialing: result.f4,
//   all: result.f5,
// };
