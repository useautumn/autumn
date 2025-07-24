import {
  AllowanceType,
  AppEnv,
  EntInterval,
  FullCusEntWithProduct,
  Organization,
  RolloverConfig,
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
import { getRolloverUpdates } from "./internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { CusProductService } from "./internal/customers/cusProducts/CusProductService.js";
import { createStripeCli } from "./external/stripe/utils.js";
import { UTCDate } from "@date-fns/utc";
import { type DrizzleCli, initDrizzle } from "./db/initDrizzle.js";
import { notNullish } from "./utils/genUtils.js";

import { CusPriceService } from "./internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { RolloverService } from "./internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { resetCustomerEntitlement } from "./cron/cronUtils.js";

dotenv.config();

export const cronTask = async () => {
  console.log(
    "\n----------------------------------\nRUNNING RESET CRON:",
    format(new UTCDate(), "yyyy-MM-dd HH:mm:ss")
  );

  const { db, client } = initDrizzle();

  try {
    let cusEnts: FullCusEntWithProduct[] =
      await CusEntService.getActiveResetPassed({ db, batchSize: 500 });

    const batchSize = 50;
    for (let i = 0; i < cusEnts.length; i += batchSize) {
      const batch = cusEnts.slice(i, i + batchSize);
      const batchResets = [];
      for (const cusEnt of batch) {
        batchResets.push(
          resetCustomerEntitlement({
            db,
            cusEnt: cusEnt as FullCusEntWithProduct,
          })
        );
      }

      await Promise.all(batchResets);
    }

    console.log(
      "FINISHED RESET CRON:",
      format(new UTCDate(), "yyyy-MM-dd HH:mm:ss")
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
  "UTC" // timezone (adjust as needed)
);

// job.start();

cronTask();
