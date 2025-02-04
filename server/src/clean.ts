import dotenv from "dotenv";
import pg from "pg";
dotenv.config();

const clean = async () => {
  const pgCli = new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
  await pgCli.connect();

  // 1. Delete custom entitlements not attached to any customer entitlement
  const { rows } = await pgCli.query(
    `DELETE FROM entitlements
      WHERE is_custom = TRUE
      AND NOT EXISTS (
          SELECT 1 
          FROM customer_entitlements 
          WHERE customer_entitlements.entitlement_id = entitlements.id
      )`
  );

  // Do the same for prices
  const { rows: pricesRows } = await pgCli.query(
    `DELETE FROM prices
      WHERE is_custom = TRUE
      AND NOT EXISTS (
          SELECT 1 
          FROM customer_prices 
          WHERE customer_prices.price_id = prices.id
      )`
  );

  const { rows: events } = await pgCli.query(
    `DELETE FROM events
      WHERE NOT EXISTS (
          SELECT 1 
          FROM customers 
          WHERE customers.id = events.customer_id
      )`
  );

  await pgCli.end();

  console.log("Cleaned up custom entitlements and prices");
};

const init = async () => {
  await clean();
  dotenv.config({ path: ".env.prod", override: true });
  await clean();
};

init();
