import {
  CusProductSchema,
  EntInterval,
  FullCustomerEntitlement,
  FullCustomerEntitlementSchema,
} from "@autumn/shared";
import { CustomerEntitlementService } from "./internal/customers/entitlements/CusEntitlementService.js";
import { createSupabaseClient } from "./external/supabaseUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { getEntOptions } from "./internal/prices/priceUtils.js";
import { getNextResetAt } from "./utils/timeUtils.js";
import chalk from "chalk";
import { z } from "zod";
import { format } from "date-fns";
import { CronJob } from "cron";
import {
  getRelatedCusPrice,
  getResetBalance,
} from "./internal/customers/entitlements/cusEntUtils.js";
import { getResetBalancesUpdate } from "./internal/customers/entitlements/groupByUtils.js";

dotenv.config();

const FullCustomerEntitlementWithProduct = FullCustomerEntitlementSchema.extend(
  {
    customer_product: CusProductSchema,
  }
);

type FullCustomerEntitlementWithProduct = z.infer<
  typeof FullCustomerEntitlementWithProduct
>;

const resetCustomerEntitlement = async ({
  sb,
  cusEnt,
}: {
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlementWithProduct;
}) => {
  try {
    if (cusEnt.usage_allowed) {
      return;
    }

    // Fetch related price
    const { data: cusPrices, error: cusPricesError } = await sb
      .from("customer_prices")
      .select("*, price:prices!inner(*)")
      .eq("customer_product_id", cusEnt.customer_product_id);

    if (cusPricesError) {
      console.log("Error fetching customer prices:", cusPricesError);
      throw new Error("Error fetching customer prices");
    }

    // 2. Quantity is from prices...
    const relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);
    const entOptions = getEntOptions(
      cusEnt.customer_product.options,
      cusEnt.entitlement
    );

    const resetBalance = getResetBalance({
      entitlement: cusEnt.entitlement,
      options: entOptions,
      relatedPrice: relatedCusPrice?.price,
    });

    // 3. Update the next_reset_at for each entitlement
    const nextResetAt = getNextResetAt(
      new Date(cusEnt.next_reset_at!),
      cusEnt.entitlement.interval as EntInterval
    );

    let resetBalanceUpdate = getResetBalancesUpdate({
      cusEnt,
    });
    await CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: {
        // balance: resetBalance,
        ...resetBalanceUpdate,
        next_reset_at: nextResetAt,
        adjustment: 0,
      },
    });

    console.log(
      `Reset ${cusEnt.id} | customer: ${chalk.yellow(
        cusEnt.customer_id
      )} | feature: ${chalk.yellow(
        cusEnt.feature_id
      )} | new balance: ${chalk.green(resetBalance)}`
    );
  } catch (error: any) {
    console.log(
      `Failed to reset ${cusEnt.id} | ${cusEnt.customer_id} | ${cusEnt.feature_id}, error: ${error}`
    );
  }
};

export const cronTask = async () => {
  console.log(
    "\n----------------------------------\nRUNNING RESET CRON:",
    format(new Date(), "yyyy-MM-dd HH:mm:ss")
  );
  // 1. Query customer_entitlements for all customers with reset_interval < now
  const sb = createSupabaseClient();
  let cusEntitlements: FullCustomerEntitlement[] = [];
  try {
    cusEntitlements = await CustomerEntitlementService.getActiveResetPassed({
      sb,
    });

    let resets = [];
    for (const cusEnt of cusEntitlements) {
      resets.push(
        resetCustomerEntitlement({
          sb,
          cusEnt: cusEnt as FullCustomerEntitlementWithProduct,
        })
      );
    }

    await Promise.all(resets);

    console.log(
      "FINISHED RESET CRON:",
      format(new Date(), "yyyy-MM-dd HH:mm:ss")
    );
    console.log("----------------------------------\n");
  } catch (error) {
    console.error("Error getting entitlements for reset:", error);
    return;
  }
};

const job = new CronJob(
  "* * * * *", // Run every minute
  function () {
    cronTask();
  },
  null, // onComplete
  true, // start immediately
  "UTC" // timezone (adjust as needed)
);

// job.start();

cronTask();
