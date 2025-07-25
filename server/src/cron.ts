import dotenv from "dotenv";
import { FullCusEntWithProduct } from "@autumn/shared";
import { CusEntService } from "./internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { format } from "date-fns";
import { CronJob } from "cron";
import { UTCDate } from "@date-fns/utc";
import { initDrizzle } from "./db/initDrizzle.js";
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
