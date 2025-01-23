import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { Inngest } from "inngest";
import { updateCustomerBalance } from "./updateBalanceUtils.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "autumn" });

const updateBalanceTask = inngest.createFunction(
  { id: "update-balance" },
  { event: "autumn/update-balance" },

  async ({ event, step, logger }) => {
    console.log("Beginning inngest update balance task...");

    try {
      const sb = createSupabaseClient();

      // 1. Update customer balance
      const { customer, features } = event.data;
      logger.info("Updating customer balance...");
      const cusEnts: any = await updateCustomerBalance({
        sb,
        customer,
        features,
      });
    } catch (error) {
      logger.error("Inngest update balance task failed...");
      logger.error(error);
    }
  }
);

// Create an empty array where we'll export future Inngest functions
export const functions = [updateBalanceTask];
