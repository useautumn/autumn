import {
  AllowanceType,
  CusProductSchema,
  EntInterval,
  FullCustomerEntitlement,
  FullCustomerEntitlementSchema,
} from "@autumn/shared";
import { CustomerEntitlementService } from "./internal/customers/entitlements/CusEntitlementService.js";
import { createSupabaseClient } from "./external/supabaseUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { getEntOptions } from "./internal/products/prices/priceUtils.js";
import { getNextResetAt } from "./utils/timeUtils.js";
import chalk from "chalk";
import { z } from "zod";
import { format, getDate, getMonth, setDate } from "date-fns";
import { CronJob } from "cron";
import {
  getRelatedCusPrice,
  getResetBalance,
} from "./internal/customers/entitlements/cusEntUtils.js";
import { getResetBalancesUpdate } from "./internal/customers/entitlements/groupByUtils.js";
import { CusProductService } from "./internal/customers/products/CusProductService.js";
import { createStripeCli } from "./external/stripe/utils.js";
import { TZDate } from "@date-fns/tz";
import { UTCDate } from "@date-fns/utc";

dotenv.config();

const FullCustomerEntitlementWithProduct = FullCustomerEntitlementSchema.extend(
  {
    customer_product: CusProductSchema,
  },
);

type FullCustomerEntitlementWithProduct = z.infer<
  typeof FullCustomerEntitlementWithProduct
>;

const checkSubAnchor = async ({
  sb,
  cusEnt,
  nextResetAt,
}: {
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlementWithProduct;
  nextResetAt: number;
}) => {
  let nextResetAtDate = new UTCDate(nextResetAt);

  // If nextResetAt is on the 28th of March, or Day 30, then do this check.
  const nextResetAtDay = getDate(nextResetAtDate);
  const nextResetAtMonth = getMonth(nextResetAtDate);

  const shouldCheck =
    nextResetAtDay === 30 || (nextResetAtDay === 28 && nextResetAtMonth === 2);

  if (!shouldCheck) {
    return nextResetAt;
  }

  // 1. Get the customer product
  const cusProduct = await CusProductService.getByIdForReset({
    sb,
    id: cusEnt.customer_product_id,
  });

  // Get org and env
  const env = cusProduct.product.env;
  const org = cusProduct.product.org;

  const stripeCli = createStripeCli({ org, env });
  if (cusProduct.subscription_ids.length == 0) {
    return nextResetAt;
  }

  const subId = cusProduct.subscription_ids[0];
  const sub = await stripeCli.subscriptions.retrieve(subId);

  const billingCycleAnchor = sub.billing_cycle_anchor * 1000;
  console.log("Checking billing cycle anchor");
  console.log(
    "Next reset at       ",
    format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss"),
  );
  console.log(
    "Billing cycle anchor",
    format(new UTCDate(billingCycleAnchor), "dd MMM yyyy HH:mm:ss"),
  );

  const billingCycleDay = getDate(new UTCDate(billingCycleAnchor));
  const nextResetDay = getDate(nextResetAtDate);

  if (billingCycleDay > nextResetDay) {
    nextResetAtDate = setDate(nextResetAtDate, billingCycleDay);
    return nextResetAtDate.getTime();
  } else {
    return nextResetAt;
  }
};

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
      cusEnt.entitlement,
    );

    const resetBalance = getResetBalance({
      entitlement: cusEnt.entitlement,
      options: entOptions,
      relatedPrice: relatedCusPrice?.price,
    });

    // 3. Update the next_reset_at for each entitlement

    // Handle if entitlement changed to unlimited...
    let entitlement = cusEnt.entitlement;
    if (entitlement.allowance_type === AllowanceType.Unlimited) {
      await CustomerEntitlementService.update({
        sb,
        id: cusEnt.id,
        updates: {
          unlimited: true,
          next_reset_at: null,
        },
      });

      console.log(
        `Reset ${cusEnt.id} | customer: ${chalk.yellow(
          cusEnt.customer_id,
        )} | feature: ${chalk.yellow(
          cusEnt.feature_id,
        )} | new balance: unlimited`,
      );
      return;
    }

    if (entitlement.interval === EntInterval.Lifetime) {
      await CustomerEntitlementService.update({
        sb,
        id: cusEnt.id,
        updates: {
          next_reset_at: null,
        },
      });

      console.log(
        `Reset ${cusEnt.id} | customer: ${chalk.yellow(
          cusEnt.customer_id,
        )} | feature: ${chalk.yellow(
          cusEnt.feature_id,
        )} | reset to lifetime (next_reset_at: null)`,
      );
      return;
    }
    let nextResetAt = getNextResetAt(
      new UTCDate(cusEnt.next_reset_at!),
      cusEnt.entitlement.interval as EntInterval,
    );

    let resetBalanceUpdate = getResetBalancesUpdate({
      cusEnt,
    });

    try {
      nextResetAt = await checkSubAnchor({
        sb,
        cusEnt,
        nextResetAt,
      });
    } catch (error) {
      console.log("WARNING: Failed to check sub anchor");
      console.log(error);
    }

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
        cusEnt.customer_id,
      )} | feature: ${chalk.yellow(
        cusEnt.feature_id,
      )} | new balance: ${chalk.green(
        resetBalance,
      )} | new next_reset_at: ${chalk.green(
        format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss"),
      )}`,
    );
  } catch (error: any) {
    console.log(
      `Failed to reset ${cusEnt.id} | ${cusEnt.customer_id} | ${cusEnt.feature_id}, error: ${error}`,
    );
  }
};

export const cronTask = async () => {
  console.log(
    "\n----------------------------------\nRUNNING RESET CRON:",
    format(new UTCDate(), "yyyy-MM-dd HH:mm:ss"),
  );
  // 1. Query customer_entitlements for all customers with reset_interval < now
  const sb = createSupabaseClient();
  let cusEntitlements: FullCustomerEntitlement[] = [];
  try {
    cusEntitlements = await CustomerEntitlementService.getActiveResetPassed({
      sb,
      // customDateUnix: new Date("2025-04-30 14:00:00").getTime(),
    });

    const batchSize = 20;
    for (let i = 0; i < cusEntitlements.length; i += batchSize) {
      const batch = cusEntitlements.slice(i, i + batchSize);
      const batchResets = [];
      for (const cusEnt of batch) {
        batchResets.push(
          resetCustomerEntitlement({
            sb,
            cusEnt: cusEnt as FullCustomerEntitlementWithProduct,
          }),
        );
      }

      await Promise.all(batchResets);
    }

    console.log(
      "FINISHED RESET CRON:",
      format(new UTCDate(), "yyyy-MM-dd HH:mm:ss"),
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
  "UTC", // timezone (adjust as needed)
);

// job.start();

cronTask();
