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
    // 1. Get allowance and quantity
    const allowance = cusEnt.entitlement.allowance || 0;

    // 2. Quantity is from prices...
    const entOptions = getEntOptions(
      cusEnt.customer_product.options,
      cusEnt.entitlement
    );

    let quantity = (entOptions && entOptions.quantity) || 1;
    const newBalance = allowance * quantity;

    // 3. Update the next_reset_at for each entitlement
    const nextResetAt = getNextResetAt(
      new Date(cusEnt.next_reset_at!),
      cusEnt.entitlement.interval as EntInterval
    );

    await CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: {
        next_reset_at: nextResetAt,
        balance: newBalance,
        adjustment: 0,
      },
    });

    console.log(
      `Reset ${cusEnt.id} | customer: ${chalk.yellow(
        cusEnt.customer_id
      )} | feature: ${chalk.yellow(
        cusEnt.feature_id
      )} | new balance: ${chalk.green(newBalance)}`
    );
  } catch (error: any) {
    console.log(`Failed to reset ${cusEnt.id}, error: ${error}`);
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
        await resetCustomerEntitlement({
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

job.start();

// cronTask();
