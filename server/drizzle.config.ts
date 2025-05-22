import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema/*",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  tablesFilter: [
    "organizations",
    "api_keys",
    "customer_prices",
    "customer_products",
    "customers",
    "demo",
    "entities",
    "entitlements",
    "events",
    "features",
    "free_trials",
    "invoice_items",
    // "invoices",
    "metadata",
    "migration_errors",
    "migration_jobs",
    "prices",
    "products",
    "referral_codes",
    "reward_programs",
    "reward_redemptions",
    "rewards",
    "subscriptions",
  ],
});
