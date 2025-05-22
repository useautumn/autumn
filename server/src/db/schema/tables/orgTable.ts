import {
  pgTable,
  text,
  numeric,
  jsonb,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

import { Organization } from "@autumn/shared";

export const organizations = pgTable(
  "organizations",
  {
    id: text().primaryKey().notNull(),
    slug: text().notNull(),
    default_currency: text("default_currency"),
    stripe_connected: boolean("stripe_connected"),
    stripe_config:
      jsonb("stripe_config").$type<Organization["stripe_config"]>(),
    test_pkey: text("test_pkey"),
    live_pkey: text("live_pkey"),
    svix_config: jsonb("svix_config").$type<Organization["svix_config"]>(),
    created_at: numeric("created_at"),
    config: jsonb().default({}),
  },
  (table) => [
    unique("organizations_test_pkey_key").on(table.test_pkey),
    unique("organizations_live_pkey_key").on(table.live_pkey),
  ],
);
