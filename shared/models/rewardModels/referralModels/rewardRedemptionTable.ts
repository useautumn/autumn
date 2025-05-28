import {
  text,
  foreignKey,
  boolean,
  pgTable,
  numeric,
} from "drizzle-orm/pg-core";
import { customers } from "../../cusModels/cusTable.js";
import { rewardPrograms } from "../rewardProgramModels/rewardProgramTable.js";
import { referralCodes } from "./referralCodeTable.js";

export const rewardRedemptions = pgTable(
  "reward_redemptions",
  {
    id: text().primaryKey().notNull(),
    created_at: numeric({ mode: "number" }),
    updated_at: numeric({ mode: "number" }),
    internal_customer_id: text("internal_customer_id"),
    triggered: boolean(),
    internal_reward_program_id: text("internal_reward_program_id"),
    applied: boolean().default(false),
    referral_code_id: text("referral_code_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.internal_customer_id],
      foreignColumns: [customers.internal_id],
      name: "reward_redemptions_internal_customer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.internal_reward_program_id],
      foreignColumns: [rewardPrograms.internal_id],
      name: "reward_redemptions_internal_reward_program_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.referral_code_id],
      foreignColumns: [referralCodes.id],
      name: "reward_redemptions_referral_code_id_fkey",
    }).onDelete("cascade"),
  ],
);
