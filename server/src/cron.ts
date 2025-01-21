import {
  BillingInterval,
  CusEntWithEntitlement,
  Duration,
  EntInterval,
} from "@autumn/shared";
import { CustomerEntitlementService } from "./internal/customers/entitlements/CusEntitlementService.js";
import { createSupabaseClient } from "./external/supabaseUtils.js";
import { getNextEntitlementReset } from "./utils/timeUtils.js";
import dotenv from "dotenv";
import { format } from "date-fns";
import pg from "pg";

dotenv.config();

export const cronTask = async () => {
  console.log("\n-----------------------------------\n");
  console.log("Running cron job");
  // 1. Query customer_entitlements for all customers with reset_interval < now
  const sbClient = createSupabaseClient();

  let cusEntitlements: CusEntWithEntitlement[] = [];
  try {
    cusEntitlements = await CustomerEntitlementService.getEntitlementsForReset(
      sbClient
    );
  } catch (error) {
    console.error("Error getting entitlements for reset:", error);
    return;
  }

  const pgClient = new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
  await pgClient.connect();

  // 2. Update the next_reset_at for each entitlement
  let updateStatements = ``;
  for (const cusEnt of cusEntitlements) {
    if (!cusEnt.next_reset_at) {
      continue;
    }

    const nextResetAt = getNextEntitlementReset(
      new Date(cusEnt.next_reset_at),
      cusEnt.entitlement.interval as EntInterval
    ).getTime();

    // TODO: Find price with config->entitlement_id = cusEnt.entitlement_id & get options
    const resetBalance = cusEnt.entitlement.allowance || 0;

    console.log(
      "Current reset at:",
      format(cusEnt.next_reset_at, "yyyy MMM dd HH:mm:ss")
    );

    console.log("Next reset at:", format(nextResetAt, "yyyy MMM dd HH:mm:ss"));

    updateStatements += `UPDATE customer_entitlements SET
        next_reset_at = ${nextResetAt},
        balance = ${resetBalance}
        WHERE id = '${cusEnt.id}';\n`;
  }

  console.log(`Resetting ${cusEntitlements.length} entitlements`);

  try {
    const result = await pgClient.query(updateStatements);
  } catch (error) {
    console.error("Error updating entitlements:", error);
  }

  await pgClient.end();
  console.log("Finished cron job");
};

// cronTask();

// Run cron job every 60 seconds
setInterval(cronTask, 60000);
