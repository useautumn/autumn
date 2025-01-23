import { logger, task } from "@trigger.dev/sdk/v3";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { updateCustomerBalance } from "./updateBalanceUtils.js";
import { handleBelowThresholdInvoicing } from "./invoiceThresholdUtils.js";
import { getBelowThresholdPrice } from "./invoiceThresholdUtils.js";

export const updateBalanceTask = task({
  id: "update-customer-balance",

  maxDuration: 300, // Stop executing after 300 secs (5 mins) of compute

  run: async (payload: any, { ctx }) => {
    try {
      const sb = createSupabaseClient();

      // 1. Update customer balance
      const { customer, features } = payload;

      logger.log("Updating customer balance...");
      const cusEnts: any = await updateCustomerBalance({
        sb,
        customer,
        features,
      });

      // 2. Check if there's below threshold price
      const belowThresholdPrice = await getBelowThresholdPrice({
        sb,
        internalCustomerId: customer.internal_id,
        cusEnts,
      });

      if (belowThresholdPrice) {
        console.log("--------------------------------");
        console.log("Below threshold price found");
        await handleBelowThresholdInvoicing({
          sb,
          internalCustomerId: payload.internalCustomerId,
          belowThresholdPrice,
        });
      }
    } catch (error) {
      console.log(`Error updating customer balance: ${error}`);
      console.log(error);
    }
  },
});

export const runUpdateBalanceTask = async (payload: any) => {
  try {
    const sb = createSupabaseClient();

    // 1. Update customer balance
    const { customer, features } = payload;

    console.log("--------------------------------");
    console.log("Inside runUpdateBalanceTask...");

    console.log("1. Updating customer balance...");
    const cusEnts: any = await updateCustomerBalance({
      sb,
      customer,
      features,
    });

    // 2. Check if there's below threshold price

    const belowThresholdPrice = await getBelowThresholdPrice({
      sb,
      internalCustomerId: customer.internal_id,
      cusEnts,
    });

    if (belowThresholdPrice) {
      console.log("2. Below threshold price found");

      // await new Promise((resolve) => setTimeout(resolve, 1000));

      await handleBelowThresholdInvoicing({
        sb,
        internalCustomerId: payload.internalCustomerId,
        belowThresholdPrice,
      });
    }
  } catch (error) {
    console.log(`Error updating customer balance: ${error}`);
    console.log(error);
  }
};
