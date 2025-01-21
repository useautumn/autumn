import { createSupabaseClient } from "./external/supabaseUtils.js";
import { createPgClient } from "./middleware/envMiddleware.js";
import dotenv from "dotenv";
dotenv.config();

const clean = async () => {
  const sb = createSupabaseClient();
  const pg = createPgClient();
  await pg.connect();

  // 1. Delete custom entitlements not attached to any customer entitlement
  const { rows } = await pg.query(
    `DELETE FROM entitlements
      WHERE is_custom = TRUE
      AND NOT EXISTS (
          SELECT 1 
          FROM customer_entitlements 
          WHERE customer_entitlements.entitlement_id = entitlements.id
      )`
  );

  // Do the same for prices
  const { rows: pricesRows } = await pg.query(
    `DELETE FROM prices
      WHERE is_custom = TRUE
      AND NOT EXISTS (
          SELECT 1 
          FROM customer_prices 
          WHERE customer_prices.price_id = prices.id
      )`
  );

  await pg.end();
  console.log("Cleaned up custom entitlements and prices");
};

clean();
