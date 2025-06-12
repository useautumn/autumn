import {
  pgTable,
  text,
  numeric,
  jsonb,
  boolean,
  unique,
  timestamp,
} from "drizzle-orm/pg-core";

import { OrgConfig } from "./orgConfig.js";
import { sql } from "drizzle-orm";

export type MinOrg = {
  id: string;
  slug: string;
};

export type SvixConfig = {
  sandbox_app_id: string;
  live_app_id: string;
};

export type StripeConfig = {
  test_api_key: string;
  live_api_key: string;
  test_webhook_secret: string;
  live_webhook_secret: string;
  success_url: string;
};

//   logo: text("logo"),
//   createdAt: timestamp("created_at").notNull(),
//   metadata: text("metadata"),

export const organizations = pgTable(
  "organizations",
  {
    id: text().primaryKey(),
    slug: text().notNull().unique(),
    // Better Auth
    name: text("name").notNull().default(""),
    logo: text("logo"),
    createdAt: timestamp("createdAt")
      .notNull()
      .default(sql`now()`), // is custom
    metadata: text("metadata"),

    // Stripe
    default_currency: text("default_currency").notNull().default("usd"),
    stripe_connected: boolean("stripe_connected").default(false),
    stripe_config: jsonb("stripe_config").$type<StripeConfig>(),
    test_pkey: text("test_pkey"),
    live_pkey: text("live_pkey"),
    svix_config: jsonb("svix_config").notNull().$type<SvixConfig>(),
    created_at: numeric({ mode: "number" }),
    config: jsonb().default({}).notNull().$type<OrgConfig>(),
  },
  (table) => [
    unique("organizations_test_pkey_key").on(table.test_pkey),
    unique("organizations_live_pkey_key").on(table.live_pkey),
  ],
);

export type Organization = typeof organizations.$inferSelect & {
  api_version: number;
};
