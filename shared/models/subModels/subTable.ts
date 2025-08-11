import {
  pgTable,
  text,
  numeric,
  jsonb,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";
import { sqlNow } from "../../db/utils.js";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text().primaryKey().notNull(),
    org_id: text("org_id").notNull(),
    stripe_id: text("stripe_id"),
    stripe_schedule_id: text("stripe_schedule_id"),
    created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
    metadata: jsonb().default({}),
    usage_features: text("usage_features").array().default([]),
    env: text(),

    current_period_start: numeric({ mode: "number" }),
    current_period_end: numeric({ mode: "number" }),
  },
  (table) => [
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "subscriptions_org_id_fkey",
    }).onDelete("cascade"),

    unique("subscriptions_stripe_id_key").on(table.stripe_id),
  ],
);

export type SubscriptionRow = InferSelectModel<typeof subscriptions>;
export type InsertSubscriptionRow = InferInsertModel<typeof subscriptions>;