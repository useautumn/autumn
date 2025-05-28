import { pgTable, text, foreignKey, boolean } from "drizzle-orm/pg-core";
import { numeric } from "drizzle-orm/pg-core";
import { organizations } from "../../orgModels/orgTable.js";
import { rewards } from "../rewardModels/rewardTable.js";

export const rewardPrograms = pgTable(
  "reward_programs",
  {
    internal_id: text("internal_id").primaryKey().notNull(),
    id: text(),
    created_at: numeric({ mode: "number" }),
    internal_reward_id: text("internal_reward_id"),
    max_redemptions: numeric({ mode: "number" }),
    unlimited_redemptions: boolean("unlimited_redemptions").default(false),
    org_id: text("org_id"),
    env: text(),
    when: text().default("immediately"),
    product_ids: text("product_ids").array().default([""]),
    exclude_trial: boolean("exclude_trial").default(false),
    received_by: text("received_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_reward_id],
      foreignColumns: [rewards.internal_id],
      name: "reward_triggers_internal_reward_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.org_id],
      foreignColumns: [organizations.id],
      name: "reward_triggers_org_id_fkey",
    }).onDelete("cascade"),
  ],
);
