import {
  AllowanceType,
  AppEnv,
  EntInterval,
  FullCusEntWithProduct,
  Organization,
} from "@autumn/shared";
import { CusEntService } from "./internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

import dotenv from "dotenv";
import { getEntOptions } from "./internal/products/prices/priceUtils.js";
import { getNextResetAt } from "./utils/timeUtils.js";
import chalk from "chalk";

import { format, getDate, getMonth, setDate } from "date-fns";
import { CronJob } from "cron";
import {
  getRelatedCusPrice,
  getResetBalance,
} from "./internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getResetBalancesUpdate } from "./internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { CusProductService } from "./internal/customers/cusProducts/CusProductService.js";
import { createStripeCli } from "./external/stripe/utils.js";
import { UTCDate } from "@date-fns/utc";
import { DrizzleCli, initDrizzle } from "./db/initDrizzle.js";

import { CusPriceService } from "./internal/customers/cusProducts/cusPrices/CusPriceService.js";

dotenv.config();

const checkSubAnchor = async ({
  db,
  cusEnt,
  nextResetAt,
}: {
  db: DrizzleCli;
  cusEnt: FullCusEntWithProduct;
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
    db,
    id: cusEnt.customer_product_id,
  });

  // Get org and env
  const env = cusProduct.product.env as AppEnv;
  const org = cusProduct.product.org as Organization;

  const stripeCli = createStripeCli({ org, env });
  if (!cusProduct.subscription_ids || cusProduct.subscription_ids.length == 0) {
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
  db,
  cusEnt,
}: {
  db: DrizzleCli;
  cusEnt: FullCusEntWithProduct;
}) => {
  try {
    if (cusEnt.usage_allowed) {
      return;
    }

    // Fetch related price
    const cusPrices = await CusPriceService.getByCustomerProductId({
      db,
      customerProductId: cusEnt.customer_product_id,
    });

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
      await CusEntService.update({
        db,
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
      await CusEntService.update({
        db,
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
      allowance: resetBalance || undefined,
    });

    try {
      nextResetAt = await checkSubAnchor({
        db,
        cusEnt,
        nextResetAt,
      });
    } catch (error) {
      console.log("WARNING: Failed to check sub anchor");
      console.log(error);
    }

    await CusEntService.update({
      db,
      id: cusEnt.id,
      updates: {
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

  const { db, client } = initDrizzle();

  try {
    let cusEnts: FullCusEntWithProduct[] =
      await CusEntService.getActiveResetPassed({ db });

    const batchSize = 20;
    for (let i = 0; i < cusEnts.length; i += batchSize) {
      const batch = cusEnts.slice(i, i + batchSize);
      const batchResets = [];
      for (const cusEnt of batch) {
        batchResets.push(
          resetCustomerEntitlement({
            db,
            cusEnt: cusEnt as FullCusEntWithProduct,
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

  await client.end();
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
